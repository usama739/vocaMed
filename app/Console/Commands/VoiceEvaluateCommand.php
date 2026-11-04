<?php

namespace App\Console\Commands;

use App\Voice\Evaluation\AudioEvaluator;
use App\Voice\Evaluation\PhraseEvaluator;
use App\Voice\Parsing\RulesIntentParser;
use App\Voice\SpeechToTextManager;
use Illuminate\Console\Command;
use InvalidArgumentException;

/**
 * Scores the voice booking pipeline on the phrase sets in tests/fixtures/voice.
 *
 * Without `--audio` it scores the rules parser on typed text: how many phrases it reads completely right, which fields it gets wrong most,
 * how each language does, and every phrase it missed. `phrases` is the set the rules were tuned on (it must stay at 100%); `holdout` is the
 * set they were not tuned on, the honest estimate for a sentence it has not seen.
 *
 * With `--audio=<folder>` it plays recordings (`01.wav` is the first phrase of the set) through the real speech driver and reports how far
 * each transcript is from what was said and whether the parser still gets the fields right from it. That spends the provider's free
 * allowance, so it plays at most `--limit` recordings with `--pace` seconds between them and stops at the first "busy".
 */
class VoiceEvaluateCommand extends Command
{
    /**
     * @var string
     */
    protected $signature = 'voice:evaluate
        {--set=all : phrases, holdout or all (with --audio, phrases or holdout)}
        {--min= : Fail (exit code 1) when the share of phrases read completely right is below this, for example 0.9}
        {--audio= : A folder of recordings named by phrase number (01.wav is the first phrase); plays them through the configured speech driver}
        {--limit=5 : With --audio, the most recordings to play (each is billed as at least 10 seconds by the provider)}
        {--pace=4 : With --audio, seconds to wait between recordings (the free tier allows 20 requests a minute; the app keeps to 15)}';

    /**
     * @var string
     */
    protected $description = 'Score the voice booking parser on the accuracy phrase sets, or real recordings through the speech provider';

    public function handle(SpeechToTextManager $speech): int
    {
        $audio = $this->option('audio');

        if (is_string($audio) && $audio !== '') {
            return $this->evaluateAudio($speech, $audio);
        }

        $sets = match ($this->option('set')) {
            'phrases' => ['phrases'],
            'holdout' => ['holdout'],
            'all' => ['phrases', 'holdout'],
            default => null,
        };

        if ($sets === null) {
            $this->error('--set must be phrases, holdout or all.');

            return self::INVALID;
        }

        $evaluator = new PhraseEvaluator(new RulesIntentParser);
        $worst = 1.0;

        foreach ($sets as $set) {
            $report = $evaluator->run(base_path("tests/fixtures/voice/$set.json"));
            $share = $report['total'] === 0 ? 0.0 : $report['passed'] / $report['total'];
            $worst = min($worst, $share);

            $this->newLine();
            $this->info(sprintf('%s: %d of %d phrases read completely right (%.0f%%)', $set, $report['passed'], $report['total'], $share * 100));

            $this->table(['Field', 'Right', 'Of', '%'], collect($report['fields'])->map(fn (array $f, string $name) => [$name, $f['right'], $f['total'], sprintf('%.0f', 100 * $f['right'] / $f['total'])])->values()->all());
            $this->table(['Language', 'Right', 'Of', '%'], collect($report['languages'])->map(fn (array $l, string $name) => [$name, $l['passed'], $l['total'], sprintf('%.0f', 100 * $l['passed'] / $l['total'])])->values()->all());

            foreach ($report['misses'] as $miss) {
                $this->warn("[{$miss['lang']}] {$miss['text']}");

                foreach ($miss['expected'] as $field => $expected) {
                    if ($expected !== $miss['actual'][$field]) {
                        $this->line(sprintf('    %s: expected %s, got %s', $field, json_encode($expected, JSON_UNESCAPED_UNICODE), json_encode($miss['actual'][$field], JSON_UNESCAPED_UNICODE)));
                    }
                }
            }
        }

        $min = $this->option('min');

        return $min !== null && $worst < (float) $min ? self::FAILURE : self::SUCCESS;
    }

    private function evaluateAudio(SpeechToTextManager $speech, string $folder): int
    {
        $set = (string) $this->option('set');

        if (! in_array($set, ['phrases', 'holdout'], true)) {
            $this->error('With --audio, --set must be phrases or holdout (the recordings are numbered by the phrases of one set).');

            return self::INVALID;
        }

        $limit = max(1, (int) $this->option('limit'));
        $pace = max(0, (int) $this->option('pace'));
        $driver = (string) config('vocamed.voice.speech_driver');

        $this->info(sprintf('Playing up to %d recording(s) from %s through the "%s" speech driver, %d s apart.', $limit, $folder, $driver, $pace));

        $evaluator = new AudioEvaluator($speech->driver(), new RulesIntentParser, (int) config('vocamed.voice.speech.prompt_characters', 500));

        try {
            $results = $evaluator->run(base_path("tests/fixtures/voice/$set.json"), $folder, $limit, $pace, function (array $r): void {
                $this->newLine();
                $this->line("#{$r['number']} ({$r['file']})");
                $this->line("    said:       {$r['said']}");

                if ($r['error'] !== null) {
                    $this->warn("    failed:     {$r['error']}");

                    return;
                }

                $this->line("    transcript: {$r['transcript']}");
                $this->line(sprintf('    word error: %.0f%%', 100 * $r['wer']));

                $wrong = array_keys(array_filter($r['fields'] ?? [], fn (bool $right) => ! $right));
                $this->line($wrong === [] ? '    fields:     all right' : '    fields wrong: '.implode(', ', $wrong));
            });
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::INVALID;
        }

        if ($results === []) {
            $this->warn('No recordings found. Name them by phrase number: 01.wav, 02.wav, ... (wav, webm, ogg, mp3, m4a, mp4 or flac).');

            return self::INVALID;
        }

        $heard = array_values(array_filter($results, fn (array $r) => $r['error'] === null));
        $perfect = count(array_filter($heard, fn (array $r) => ! in_array(false, $r['fields'] ?? [], true)));
        $mean = $heard === [] ? 0.0 : array_sum(array_column($heard, 'wer')) / count($heard);

        $this->newLine();
        $this->info(sprintf(
            '%d of %d recordings gave a transcript; %d of those read completely right by the parser; average word error %.0f%%.',
            count($heard),
            count($results),
            $perfect,
            100 * $mean,
        ));
        $this->line(sprintf('This run used %d request(s), billed by the provider as at least %d audio seconds in all.', count($results), count($results) * (int) config('vocamed.voice.budget.billed_minimum_seconds', 10)));

        return count($heard) === count($results) ? self::SUCCESS : self::FAILURE;
    }
}
