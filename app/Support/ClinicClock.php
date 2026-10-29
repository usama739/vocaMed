<?php

namespace App\Support;

use App\Models\Clinic;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use InvalidArgumentException;

/**
 * The one place that converts between instants (stored and sent as UTC) and a clinic's own days and
 * times (what people see and what slots are built from). Everything that needs "today" or a
 * clinic-local date reads it here, so tests move time with Carbon's test now and nothing else.
 */
final class ClinicClock
{
    public function __construct(private readonly string $timezone) {}

    public static function for(Clinic $clinic): self
    {
        return new self($clinic->timezone);
    }

    public function timezone(): string
    {
        return $this->timezone;
    }

    /** The current moment, expressed in the clinic's timezone. */
    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone);
    }

    /** The clinic-local calendar day, `YYYY-MM-DD`. */
    public function today(): string
    {
        return $this->now()->format('Y-m-d');
    }

    public function toLocal(CarbonInterface $instant): CarbonImmutable
    {
        return CarbonImmutable::instance($instant)->setTimezone($this->timezone);
    }

    /** The clinic-local calendar day an instant falls on, `YYYY-MM-DD`. */
    public function dateOf(CarbonInterface $instant): string
    {
        return $this->toLocal($instant)->format('Y-m-d');
    }

    /** The clinic-local time of day of an instant, `HH:MM`. */
    public function timeOf(CarbonInterface $instant): string
    {
        return $this->toLocal($instant)->format('H:i');
    }

    /** The UTC instant of a clinic-local date (`YYYY-MM-DD`) and time (`HH:MM`). */
    public function toInstant(string $date, string $time = '00:00'): CarbonImmutable
    {
        $local = CarbonImmutable::createFromFormat('!Y-m-d H:i', "{$date} {$time}", $this->timezone);

        if ($local === null || $local->format('Y-m-d H:i') !== "{$date} {$time}") {
            throw new InvalidArgumentException("Not a clinic-local date and time: {$date} {$time}");
        }

        return $local->utc();
    }

    /** The UTC instant at which a clinic-local day begins. Daylight saving days are not 24 hours long. */
    public function startOfDay(string $date): CarbonImmutable
    {
        return $this->toInstant($date);
    }

    /** The UTC instant at which the next clinic-local day begins (an exclusive end for range queries). */
    public function endOfDay(string $date): CarbonImmutable
    {
        $next = CarbonImmutable::createFromFormat('!Y-m-d', $date, $this->timezone);

        if ($next === null || $next->format('Y-m-d') !== $date) {
            throw new InvalidArgumentException("Not a clinic-local date: {$date}");
        }

        return $next->addDay()->utc();
    }
}
