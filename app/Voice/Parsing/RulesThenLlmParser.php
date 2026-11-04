<?php

namespace App\Voice\Parsing;

use App\Voice\Contracts\IntentParser;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;

/**
 * The way the language-model parser is meant to be used: the rules read the sentence first, and only a sentence they could not make much
 * of goes to the model. That keeps the common case free, instant and on our own server, and sends a clinic's text to a third party only
 * when the rules found fewer than two of patient, doctor, day and time. It is never worse than the rules alone: if the model cannot be
 * reached, is busy or answers badly, the rules' own reading is used (and if the rules could read nothing at all, the model's failure is
 * the failure). When the model does answer, its names are used and the rules' own phone number, day and time win over its.
 */
class RulesThenLlmParser implements IntentParser
{
    /** Fewer found fields than this and the model is asked. */
    private const ENOUGH = 2;

    public function __construct(private readonly RulesIntentParser $rules, private readonly LlmIntentParser $llm) {}

    public function parse(string $text, ParseContext $context): ParsedIntent
    {
        try {
            $read = $this->rules->parse($text, $context);
        } catch (IntentFailed) {
            return $this->llm->parse($text, $context);
        }

        if ($read->kind === ParsedIntent::UNSUPPORTED || $this->found($read) >= self::ENOUGH) {
            return $read;
        }

        try {
            $asked = $this->llm->parse($text, $context);
        } catch (IntentFailed) {
            return $read;
        }

        // Names are what a language model is for; a phone number, a day and a time are what the rules are exact about, so theirs win.
        return new ParsedIntent(
            $asked->kind,
            $asked->patientName ?? $read->patientName,
            $read->patientPhone ?? $asked->patientPhone,
            $asked->doctorName ?? $read->doctorName,
            $asked->serviceName ?? $read->serviceName,
            $read->date ?? $asked->date,
            $read->time ?? $asked->time,
        );
    }

    private function found(ParsedIntent $read): int
    {
        return count(array_filter([$read->patientName, $read->doctorName, $read->date, $read->time], fn (?string $value) => $value !== null));
    }
}
