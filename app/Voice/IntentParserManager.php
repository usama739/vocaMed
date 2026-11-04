<?php

namespace App\Voice;

use App\Voice\Contracts\IntentParser;
use App\Voice\Parsing\FakeIntentParser;
use App\Voice\Parsing\LlmIntentParser;
use App\Voice\Parsing\RulesIntentParser;
use App\Voice\Parsing\RulesThenLlmParser;
use Illuminate\Support\Manager;

/**
 * The text-to-booking-fields parser, chosen by `vocamed.voice.intent_driver`:
 * - `rules`: plain code, no network (the default);
 * - `rules_llm`: the rules first, and a language model only for a sentence they could not make much of;
 * - `llm`: the language model for everything;
 * - `fake`: fixed fields, for tests.
 */
class IntentParserManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return (string) $this->config->get('vocamed.voice.intent_driver', 'fake');
    }

    public function createRulesDriver(): IntentParser
    {
        return $this->container->make(RulesIntentParser::class);
    }

    public function createRulesLlmDriver(): IntentParser
    {
        return new RulesThenLlmParser($this->container->make(RulesIntentParser::class), $this->llm());
    }

    public function createLlmDriver(): IntentParser
    {
        return $this->llm();
    }

    public function createFakeDriver(): IntentParser
    {
        return $this->container->make(FakeIntentParser::class);
    }

    private function llm(): LlmIntentParser
    {
        $intent = (array) $this->config->get('vocamed.voice.intent', []);

        return new LlmIntentParser(
            (string) ($intent['base_url'] ?? ''),
            (string) ($intent['api_key'] ?? ''),
            (string) ($intent['model'] ?? 'openai/gpt-oss-20b'),
            (int) ($intent['timeout'] ?? 20),
        );
    }
}
