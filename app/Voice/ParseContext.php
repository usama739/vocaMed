<?php

namespace App\Voice;

use App\Models\Clinic;
use Carbon\CarbonImmutable;

/** What a parser needs to know about "now": words like "tomorrow" or "kal" mean a day in the clinic's own timezone. */
final class ParseContext
{
    public function __construct(public readonly CarbonImmutable $now, public readonly string $timezone) {}

    public static function forClinic(Clinic $clinic): self
    {
        return new self(CarbonImmutable::now($clinic->timezone), $clinic->timezone);
    }
}
