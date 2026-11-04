<?php

namespace App\Voice\Parsing;

use App\Voice\Contracts\IntentParser;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Reads a booking request with a language model behind any OpenAI-compatible chat API that can answer in a JSON schema (Groq's free
 * gpt-oss models now). It sends the request's text, the clinic's day and its doctor and service names to that provider, so it is only used
 * when INTENT_DRIVER says so (see `RulesThenLlmParser` for the way it is meant to be used).
 *
 * The model is told to copy names as heard and to leave out anything not said, and its answer is checked before it is trusted: a time that
 * is not an hour and minute, a kind it was not offered, or a field of the wrong type fails the request instead of being booked from. It is
 * asked for the words that said the day and the time, and the rules work the date and time out from them. The provider's free tier is
 * limited per minute and per day, and this stays under it by its own count (`limits.llm_*`).
 */
class LlmIntentParser implements IntentParser
{
    private const INSTRUCTIONS = <<<'TEXT'
You read a clinic receptionist's request to book an appointment, written or spoken in English, Roman Urdu (Urdu in Latin letters) or Urdu script, or a mix. Reply only with JSON matching the schema.
- kind is "book" for a request to make an appointment, and "unsupported" for anything else (cancel, move, look something up).
- patientName, doctorName and serviceName: copy the words as they were said or written, without translating or changing the script. doctorName has no title ("Dr"). Use null for anything not said.
- patientPhone: the number as said, or null.
- dayWords: the words that said which day, copied exactly as said ("kal", "next Monday", "15 November", "پرسوں"), or null. Do not work out the date.
- timeWords: the words that said what time, copied exactly as said ("teen baje", "saade teen baje", "half past nine", "دو بجے"), including any "morning", "afternoon", "shaam" or "pm" that goes with it, or null.
- time: that time as 24-hour HH:MM. With no morning or evening said, 1 to 6 is the afternoon, 7 to 11 the morning, 12 noon. Use null if no time was said.
- Never invent a value that was not in the request. The lists of doctors and services are only to help you spell what you heard.
TEXT;

    private readonly RulesIntentParser $rules;

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $apiKey,
        private readonly string $model,
        private readonly int $timeout = 20,
        ?RulesIntentParser $rules = null,
    ) {
        $this->rules = $rules ?? new RulesIntentParser;
    }

    public function parse(string $text, ParseContext $context): ParsedIntent
    {
        if ($this->apiKey === '' || $this->baseUrl === '') {
            throw new IntentFailed('not_configured');
        }

        $this->spend();

        $today = $context->now->setTimezone($context->timezone);

        try {
            $response = Http::withToken($this->apiKey)
                ->acceptJson()
                ->timeout($this->timeout)
                ->post(rtrim($this->baseUrl, '/').'/chat/completions', [
                    'model' => $this->model,
                    'temperature' => 0,
                    'messages' => [
                        ['role' => 'system', 'content' => self::INSTRUCTIONS],
                        ['role' => 'user', 'content' => json_encode([
                            'request' => $text,
                            'today' => $today->format('Y-m-d'),
                            'weekday' => $today->englishDayOfWeek,
                            'timezone' => $context->timezone,
                            'doctors' => $context->doctorNames,
                            'services' => $context->serviceNames,
                        ], JSON_UNESCAPED_UNICODE)],
                    ],
                    'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'booking_request', 'strict' => true, 'schema' => self::schema()]],
                ]);
        } catch (ConnectionException) {
            throw new IntentFailed('unavailable', retryable: true);
        }

        if (! $response->successful()) {
            throw $this->refusal($response);
        }

        $content = $response->json('choices.0.message.content');
        $answer = is_string($content) ? json_decode($content, true) : null;

        return $this->checked($answer, $context);
    }

    /**
     * What the model must answer: every field present, each a string or null (strict mode needs all fields listed). The day is asked for as
     * the words that said it, not as a date: working out a date is exactly what a language model gets wrong.
     *
     * @return array<string, mixed>
     */
    private static function schema(): array
    {
        $text = ['type' => ['string', 'null']];

        return [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => ['kind', 'patientName', 'patientPhone', 'doctorName', 'serviceName', 'dayWords', 'timeWords', 'time'],
            'properties' => [
                'kind' => ['type' => 'string', 'enum' => [ParsedIntent::BOOK, ParsedIntent::UNSUPPORTED]],
                'patientName' => $text,
                'patientPhone' => $text,
                'doctorName' => $text,
                'serviceName' => $text,
                'dayWords' => $text,
                'timeWords' => $text,
                'time' => $text,
            ],
        ];
    }

    /**
     * Trust the answer only if it is what was asked for, and work out the day and time from its words with the rules: a language model
     * reads "saade teen baje" and "this Thursday" well enough to copy them, but it does the arithmetic wrongly often enough (a live check
     * on Groq's gpt-oss-20b read 3:30 in the afternoon as 13:30 and Thursday as Wednesday). Only when the rules cannot read the time words
     * is the model's own HH:MM used, and only when it is a real time.
     */
    private function checked(mixed $answer, ParseContext $context): ParsedIntent
    {
        if (! is_array($answer) || ! in_array($answer['kind'] ?? null, [ParsedIntent::BOOK, ParsedIntent::UNSUPPORTED], true)) {
            throw new IntentFailed('invalid_output');
        }

        foreach (['patientName', 'patientPhone', 'doctorName', 'serviceName', 'dayWords', 'timeWords', 'time'] as $field) {
            if (isset($answer[$field]) && ! is_string($answer[$field])) {
                throw new IntentFailed('invalid_output');
            }
        }

        $time = $answer['time'] ?? null;

        if ($time !== null && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time) !== 1) {
            throw new IntentFailed('invalid_output');
        }

        $day = $this->readWords($answer['dayWords'] ?? null, $context);
        $clock = $this->readWords($answer['timeWords'] ?? null, $context);

        return ParsedIntent::fromArray([...$answer, 'date' => $day?->date, 'time' => $clock->time ?? $time]);
    }

    /** What the rules make of a few words that said a day or a time (the word "book" only stops a bare day from being unreadable). */
    private function readWords(?string $words, ParseContext $context): ?ParsedIntent
    {
        if ($words === null || trim($words) === '') {
            return null;
        }

        try {
            return $this->rules->parse('book '.$words, $context);
        } catch (IntentFailed) {
            return null;
        }
    }

    /** The provider's free tier is limited per minute and per day; stay under it by our own count rather than learn it from an error. */
    private function spend(): void
    {
        $limits = [
            ['voice-llm:minute', (int) config('vocamed.voice.limits.llm_minute'), 60],
            ['voice-llm:day', (int) config('vocamed.voice.limits.llm_day'), 86400],
        ];

        foreach ($limits as [$key, $max]) {
            if ($max > 0 && RateLimiter::tooManyAttempts($key, $max)) {
                throw new IntentFailed('rate_limited', retryable: true);
            }
        }

        foreach ($limits as [$key, $max, $decay]) {
            RateLimiter::hit($key, $decay);
        }
    }

    private function refusal(Response $response): IntentFailed
    {
        $status = $response->status();

        Log::warning('The language model provider refused a request.', ['status' => $status, 'model' => $this->model]);

        return match (true) {
            $status === 429 => new IntentFailed('rate_limited', retryable: true),
            $status === 401 || $status === 403 => new IntentFailed('provider_auth'),
            $status === 408 || $status >= 500 => new IntentFailed('unavailable', retryable: true),
            default => new IntentFailed('rejected'),
        };
    }
}
