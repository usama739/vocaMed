<?php

namespace App\Voice;

use App\Voice\Contracts\IntentParser;
use App\Voice\Parsing\FakeIntentParser;
use Illuminate\Support\Manager;

/**
 * The text-to-booking-fields parser, chosen by `vocamed.voice.intent_driver`. `fake` answers with fixed fields. The rules parser
 * (`createRulesDriver()`) arrives in the understanding step and the optional LLM parser (`createLlmDriver()`) in the providers step.
 */
class IntentParserManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return (string) $this->config->get('vocamed.voice.intent_driver', 'fake');
    }

    public function createFakeDriver(): IntentParser
    {
        return $this->container->make(FakeIntentParser::class);
    }
}
