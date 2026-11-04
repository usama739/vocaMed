<?php

namespace App\Voice;

use App\Models\Clinic;
use Carbon\CarbonImmutable;

/**
 * What a parser needs to know: "now" in the clinic's own timezone (words like "tomorrow" or "kal" mean a day there) and, when the
 * caller has them, the names this clinic uses for its doctors and services. The names are only hints: a parser that knows them can
 * tell a doctor's name from a patient's even when nobody said "Dr".
 */
final class ParseContext
{
    /**
     * @param  list<string>  $doctorNames  active doctors' names as the clinic writes them
     * @param  list<string>  $serviceNames  active services' names as the clinic writes them
     */
    public function __construct(
        public readonly CarbonImmutable $now,
        public readonly string $timezone,
        public readonly array $doctorNames = [],
        public readonly array $serviceNames = [],
    ) {}

    public static function forClinic(Clinic $clinic): self
    {
        return new self(CarbonImmutable::now($clinic->timezone), $clinic->timezone);
    }
}
