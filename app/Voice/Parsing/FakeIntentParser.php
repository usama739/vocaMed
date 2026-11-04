<?php

namespace App\Voice\Parsing;

use App\Voice\Contracts\IntentParser;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;

/** Understands every request as the same booking (`vocamed.voice.fake_intent`), so the voice pipeline can be run before a real parser exists. */
class FakeIntentParser implements IntentParser
{
    public function parse(string $text, ParseContext $context): ParsedIntent
    {
        /** @var array<string, mixed> $fields */
        $fields = (array) config('vocamed.voice.fake_intent', []);

        return ParsedIntent::fromArray($fields);
    }
}
