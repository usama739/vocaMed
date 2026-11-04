<?php

namespace App\Voice;

use App\Voice\Contracts\IntentParser;
use App\Voice\Parsing\FakeIntentParser;
use App\Voice\Parsing\RulesIntentParser;
use Illuminate\Support\Manager;

/**
 * The text-to-booking-fields parser, chosen by `vocamed.voice.intent_driver`. `rules` is plain code (the default); `fake` answers with
 * fixed fields. The optional LLM parser (`createLlmDriver()`) arrives in the providers step.
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

    public function createFakeDriver(): IntentParser
    {
        return $this->container->make(FakeIntentParser::class);
    }
}
