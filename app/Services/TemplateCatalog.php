<?php

namespace App\Services;

use App\Exceptions\UnknownVariable;
use App\Models\NotificationTemplate;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The clinic's message wording: the built-in text for each kind, channel and language, with the clinic's own edits laid
 * over it. A message is stored only while it differs from the built-in text.
 */
class TemplateCatalog
{
    public function __construct(private readonly Audit $audit) {}

    /**
     * Every message the Templates page lists (kinds × channels × languages), with what it says now and its default.
     *
     * @return list<array{kind: string, channel: string, locale: string, body: string, defaultBody: string, isCustom: bool}>
     */
    public function all(): array
    {
        $custom = NotificationTemplate::query()->get()->keyBy(fn (NotificationTemplate $t) => "$t->kind|$t->channel|$t->locale");
        $rows = [];

        foreach ((array) config('templates.kinds') as $kind) {
            foreach ((array) config('templates.channels') as $channel) {
                foreach ((array) config('templates.locales') as $locale) {
                    $default = $this->defaultBody($kind, $locale);
                    $own = $custom->get("$kind|$channel|$locale");

                    $rows[] = ['kind' => $kind, 'channel' => $channel, 'locale' => $locale, 'body' => $own === null ? $default : $own->body, 'defaultBody' => $default, 'isCustom' => $own !== null];
                }
            }
        }

        return $rows;
    }

    /**
     * Save the clinic's wording for one message. Text equal to the built-in wording is not stored (it is the default again).
     */
    public function save(string $kind, string $channel, string $locale, string $body): void
    {
        $body = $this->checked($body);

        DB::transaction(function () use ($kind, $channel, $locale, $body): void {
            $row = $this->find($kind, $channel, $locale);

            if ($body === $this->defaultBody($kind, $locale)) {
                $row?->delete();
            } else {
                $row ??= new NotificationTemplate;
                $row->forceFill(['kind' => $kind, 'channel' => $channel, 'locale' => $locale, 'body' => $body])->save();
            }

            $this->audit->record('template.updated', $row, compact('kind', 'channel', 'locale'));
        });
    }

    /** Back to the built-in wording. */
    public function reset(string $kind, string $channel, string $locale): void
    {
        DB::transaction(function () use ($kind, $channel, $locale): void {
            $row = $this->find($kind, $channel, $locale);

            if ($row === null) {
                return;
            }

            $row->delete();
            $this->audit->record('template.reset', null, compact('kind', 'channel', 'locale'));
        });
    }

    /** Refuse an empty message and any {placeholder} the system does not fill in; returns the trimmed text. */
    public function checked(string $body): string
    {
        $body = trim($body);

        if ($body === '' || mb_strlen($body) > (int) config('templates.max_length')) {
            throw ValidationException::withMessages(['body' => ['Write a message of 1 to '.config('templates.max_length').' characters.']]);
        }

        preg_match_all('/\{([^{}]*)\}/u', $body, $found);

        foreach ($found[1] as $name) {
            if (! in_array($name, (array) config('templates.variables'), true)) {
                throw new UnknownVariable($name);
            }
        }

        return $body;
    }

    /** The built-in wording for a kind and language. */
    public function defaultBody(string $kind, string $locale): string
    {
        return (string) config("templates.defaults.$kind.$locale");
    }

    private function find(string $kind, string $channel, string $locale): ?NotificationTemplate
    {
        return NotificationTemplate::query()->where(['kind' => $kind, 'channel' => $channel, 'locale' => $locale])->first();
    }
}
