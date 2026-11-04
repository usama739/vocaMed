<?php

namespace App\Console\Commands;

use App\Voice\Evaluation\PhraseEvaluator;
use App\Voice\Parsing\RulesIntentParser;
use Illuminate\Console\Command;

/**
 * Scores the rules parser on the phrase sets in tests/fixtures/voice: how many phrases it reads completely right, which fields it gets
 * wrong most, how each language does, and every phrase it missed. `phrases` is the set the rules were tuned on (it must stay at 100%);
 * `holdout` is the set they were not tuned on, the honest estimate for a sentence it has not seen.
 */
class VoiceEvaluateCommand extends Command
{
    /**
     * @var string
     */
    protected $signature = 'voice:evaluate
        {--set=all : phrases, holdout or all}
        {--min= : Fail (exit code 1) when the share of phrases read completely right is below this, for example 0.9}';

    /**
     * @var string
     */
    protected $description = 'Score the voice booking parser on the accuracy phrase sets';

    public function handle(): int
    {
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
}
