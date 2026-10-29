<?php

namespace Tests\Unit;

use App\Support\ClinicClock;
use Carbon\CarbonImmutable;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ClinicClockTest extends TestCase
{
    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();

        parent::tearDown();
    }

    public function test_today_is_the_clinic_local_day_not_the_utc_day(): void
    {
        // 20:30 UTC on Sunday is already 01:30 on Monday in Karachi (UTC+5).
        CarbonImmutable::setTestNow('2026-10-25T20:30:00Z');

        $clock = new ClinicClock('Asia/Karachi');

        $this->assertSame('2026-10-26', $clock->today());
        $this->assertSame('01:30', $clock->timeOf(CarbonImmutable::now()));
    }

    public function test_a_local_date_and_time_becomes_a_utc_instant_and_back(): void
    {
        $clock = new ClinicClock('Asia/Karachi');

        $instant = $clock->toInstant('2026-10-26', '10:15');

        $this->assertSame('2026-10-26T05:15:00+00:00', $instant->toIso8601String());
        $this->assertSame('2026-10-26', $clock->dateOf($instant));
        $this->assertSame('10:15', $clock->timeOf($instant));
    }

    public function test_a_day_is_the_range_from_its_start_to_the_start_of_the_next(): void
    {
        $clock = new ClinicClock('Asia/Karachi');

        $this->assertSame('2026-10-25T19:00:00+00:00', $clock->startOfDay('2026-10-26')->toIso8601String());
        $this->assertSame('2026-10-26T19:00:00+00:00', $clock->endOfDay('2026-10-26')->toIso8601String());
    }

    public function test_a_daylight_saving_day_is_not_24_hours_long(): void
    {
        // New York clocks go back on 2026-11-01, so that local day lasts 25 hours.
        $clock = new ClinicClock('America/New_York');

        $hours = $clock->startOfDay('2026-11-01')->diffInHours($clock->endOfDay('2026-11-01'));

        $this->assertSame(25, (int) $hours);
    }

    public function test_input_that_is_not_a_real_date_or_time_is_rejected(): void
    {
        $clock = new ClinicClock('Asia/Karachi');

        $this->expectException(InvalidArgumentException::class);

        $clock->toInstant('2026-02-30', '10:00');
    }
}
