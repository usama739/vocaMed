<?php

namespace App\Voice\Contracts;

use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;

/**
 * Text in, what the person asked for out: the words they used for patient, doctor, service, day and time. It does not look anything
 * up; turning those words into this clinic's real records is the resolver's job.
 */
interface IntentParser
{
    /**
     * @throws IntentFailed when the text cannot be read at all
     */
    public function parse(string $text, ParseContext $context): ParsedIntent;
}
