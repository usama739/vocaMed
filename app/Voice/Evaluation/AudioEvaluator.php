<?php

namespace App\Voice\Evaluation;

use App\Voice\Contracts\IntentParser;
use App\Voice\Contracts\SpeechToText;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\SpeechFailed;
use App\Voice\SpeechHints;
use App\Voice\SpeechInput;
use App\Voice\Text\Folding;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Plays real recordings through the real speech driver and measures what comes back: how far the transcript is from what was said (word
 * error rate), and whether the parser then still gets every field right from that transcript. A recording is matched to a phrase by its
 * number: `01.wav` is the first phrase of the set, `07.webm` the seventh.
 *
 * It is made for a free tier: at most `$limit` recordings, a pause between them (`$paceSeconds`), and it stops at the first "busy" from the
 * provider rather than pushing on. Every request is billed by the provider as at least ten seconds.
 *
 * @phpstan-type Result array{number: int, file: string, said: string, transcript: string|null, error: string|null, wer: float|null, fields: array<string, bool>|null}
 */
final class AudioEvaluator
{
    private const FIELDS = ['kind', 'patientName', 'patientPhone', 'doctorName', 'serviceName', 'date', 'time'];

    private const TYPES = ['wav' => 'audio/wav', 'webm' => 'audio/webm', 'ogg' => 'audio/ogg', 'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'mp4' => 'audio/mp4', 'flac' => 'audio/flac'];

    public function __construct(private readonly SpeechToText $speech, private readonly IntentParser $parser, private readonly int $promptCharacters = 500) {}

    /**
     * @param  callable(array<string, mixed>): void|null  $each  called with each result as soon as it is known
     * @return list<Result>
     */
    public function run(string $phraseFile, string $folder, int $limit, int $paceSeconds, ?callable $each = null): array
    {
        $json = is_file($phraseFile) ? file_get_contents($phraseFile) : false;
        $set = $json === false ? null : json_decode($json, true);

        if (! is_array($set) || ! is_dir($folder)) {
            throw new InvalidArgumentException('A phrase set and a folder of recordings are needed.');
        }

        $context = new ParseContext(CarbonImmutable::parse($set['now'], $set['timezone']), $set['timezone'], array_values($set['doctors'] ?? []), array_values($set['services'] ?? []));
        $prompt = SpeechHints::prompt($context->doctorNames, $context->serviceNames, $this->promptCharacters);
        $results = [];

        foreach (array_values($set['phrases']) as $index => $phrase) {
            if (count($results) >= $limit) {
                break;
            }

            $file = $this->recording($folder, $index + 1);

            if ($file === null) {
                continue;
            }

            if ($results !== [] && $paceSeconds > 0) {
                sleep($paceSeconds);
            }

            $result = $this->one($index + 1, $file, $phrase, $context, $prompt);
            $results[] = $result;

            if ($each !== null) {
                $each($result);
            }

            // The provider said it is busy: stop, rather than spend what is left of the minute on more refusals.
            if ($result['error'] === 'rate_limited') {
                break;
            }
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $phrase
     * @return Result
     */
    private function one(int $number, string $file, array $phrase, ParseContext $context, ?string $prompt): array
    {
        $result = ['number' => $number, 'file' => basename($file), 'said' => (string) $phrase['text'], 'transcript' => null, 'error' => null, 'wer' => null, 'fields' => null];
        $type = self::TYPES[strtolower(pathinfo($file, PATHINFO_EXTENSION))];

        try {
            $result['transcript'] = $this->speech->transcribe(SpeechInput::forRecording((string) file_get_contents($file), $type, prompt: $prompt));
        } catch (SpeechFailed $failed) {
            $result['error'] = $failed->reason;

            return $result;
        }

        $result['wer'] = $this->wordErrorRate($result['said'], $result['transcript']);

        try {
            $actual = $this->parser->parse($result['transcript'], $context)->toArray();
        } catch (IntentFailed) {
            $actual = ['kind' => 'unreadable'] + array_fill_keys(self::FIELDS, null);
        }

        $expected = [...array_fill_keys(self::FIELDS, null), 'kind' => 'book', ...$phrase['expect']];
        $checked = $expected['kind'] === 'unsupported' ? ['kind'] : self::FIELDS;

        foreach ($checked as $field) {
            $result['fields'][$field] = $expected[$field] === $actual[$field];
        }

        return $result;
    }

    private function recording(string $folder, int $number): ?string
    {
        foreach ([sprintf('%02d', $number), (string) $number] as $name) {
            foreach (array_keys(self::TYPES) as $extension) {
                if (is_file("$folder/$name.$extension")) {
                    return "$folder/$name.$extension";
                }
            }
        }

        return null;
    }

    /** Words that differ between what was said and what was heard, as a share of the words said (0 is perfect; it can pass 1). */
    public function wordErrorRate(string $said, string $heard): float
    {
        $a = $this->words($said);
        $b = $this->words($heard);

        if ($a === []) {
            return $b === [] ? 0.0 : 1.0;
        }

        $row = range(0, count($b));

        foreach ($a as $i => $word) {
            $previous = $row[0];
            $row[0] = $i + 1;

            foreach ($b as $j => $other) {
                $current = $row[$j + 1];
                $row[$j + 1] = min($row[$j + 1] + 1, $row[$j] + 1, $previous + ($word === $other ? 0 : 1));
                $previous = $current;
            }
        }

        return $row[count($b)] / count($a);
    }

    /**
     * @return list<string>
     */
    private function words(string $text): array
    {
        $clean = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', Folding::fold($text)) ?? '';

        return array_values(array_filter(preg_split('/\s+/u', trim($clean)) ?: [], fn (string $word) => $word !== ''));
    }
}
