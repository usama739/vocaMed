<?php

namespace App\Voice\Evaluation;

use App\Voice\Contracts\IntentParser;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Runs a parser over a file of phrases with the fields each one must give, and scores it: per phrase (every field right), per field and
 * per language. It is how the rules are measured, in tests and by `php artisan voice:evaluate`, instead of guessed at.
 *
 * @phpstan-type Miss array{lang: string, text: string, expected: array<string, string|null>, actual: array<string, string|null>}
 * @phpstan-type Report array{total: int, passed: int, fields: array<string, array{right: int, total: int}>, languages: array<string, array{passed: int, total: int}>, misses: list<Miss>}
 */
final class PhraseEvaluator
{
    private const FIELDS = ['kind', 'patientName', 'patientPhone', 'doctorName', 'serviceName', 'date', 'time'];

    public function __construct(private readonly IntentParser $parser) {}

    /**
     * @return Report
     */
    public function run(string $file): array
    {
        $json = is_file($file) ? file_get_contents($file) : false;
        $set = $json === false ? null : json_decode($json, true);

        if (! is_array($set) || ! isset($set['phrases'], $set['now'], $set['timezone'])) {
            throw new InvalidArgumentException("Not a phrase set: $file");
        }

        $context = new ParseContext(
            CarbonImmutable::parse($set['now'], $set['timezone']),
            $set['timezone'],
            array_values($set['doctors'] ?? []),
            array_values($set['services'] ?? []),
        );

        $report = ['total' => 0, 'passed' => 0, 'fields' => [], 'languages' => [], 'misses' => []];

        foreach ($set['phrases'] as $phrase) {
            $expected = $this->fill($phrase['expect']);
            $actual = $this->read($phrase['text'], $context);
            $lang = (string) $phrase['lang'];

            // A request that is not a booking only has to be recognised as one.
            $fields = $expected['kind'] === 'unsupported' ? ['kind'] : self::FIELDS;
            $right = true;

            foreach ($fields as $field) {
                $same = $expected[$field] === $actual[$field];
                $report['fields'][$field]['right'] = ($report['fields'][$field]['right'] ?? 0) + ($same ? 1 : 0);
                $report['fields'][$field]['total'] = ($report['fields'][$field]['total'] ?? 0) + 1;
                $right = $right && $same;
            }

            $report['total']++;
            $report['passed'] += $right ? 1 : 0;
            $report['languages'][$lang]['passed'] = ($report['languages'][$lang]['passed'] ?? 0) + ($right ? 1 : 0);
            $report['languages'][$lang]['total'] = ($report['languages'][$lang]['total'] ?? 0) + 1;

            if (! $right) {
                $report['misses'][] = ['lang' => $lang, 'text' => (string) $phrase['text'], 'expected' => $expected, 'actual' => $actual];
            }
        }

        return $report;
    }

    /**
     * @return array<string, string|null>
     */
    private function read(string $text, ParseContext $context): array
    {
        try {
            return $this->parser->parse($text, $context)->toArray();
        } catch (IntentFailed) {
            return ['kind' => 'unreadable'] + array_fill_keys(self::FIELDS, null);
        }
    }

    /**
     * @param  array<string, string|null>  $expect
     * @return array<string, string|null>
     */
    private function fill(array $expect): array
    {
        return [...array_fill_keys(self::FIELDS, null), 'kind' => 'book', ...$expect];
    }
}
