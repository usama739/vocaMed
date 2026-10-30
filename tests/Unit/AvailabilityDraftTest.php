<?php

namespace Tests\Unit;

use App\Data\AvailabilityDraft;
use PHPUnit\Framework\TestCase;

class AvailabilityDraftTest extends TestCase
{
    /**
     * @return array{weekday: int, on: bool, start: string, end: string, lunch: bool}
     */
    private function day(string $start, string $end, bool $lunch, bool $on = true): array
    {
        return ['weekday' => 1, 'on' => $on, 'start' => $start, 'end' => $end, 'lunch' => $lunch];
    }

    public function test_a_day_without_lunch_is_one_interval()
    {
        $this->assertSame([['09:00', '17:00']], AvailabilityDraft::intervals($this->day('09:00', '17:00', false)));
    }

    public function test_lunch_splits_the_day_around_one_to_two()
    {
        $this->assertSame([['09:00', '13:00'], ['14:00', '17:00']], AvailabilityDraft::intervals($this->day('09:00', '17:00', true)));
    }

    public function test_a_morning_that_ends_in_lunch_stops_at_one()
    {
        $this->assertSame([['09:00', '13:00']], AvailabilityDraft::intervals($this->day('09:00', '13:30', true)));
    }

    public function test_an_afternoon_that_starts_in_lunch_starts_at_two()
    {
        $this->assertSame([['14:00', '17:00']], AvailabilityDraft::intervals($this->day('13:30', '17:00', true)));
    }

    public function test_a_day_that_lies_wholly_in_lunch_is_nothing()
    {
        $this->assertSame([], AvailabilityDraft::intervals($this->day('13:00', '14:00', true)));
    }

    public function test_a_day_that_is_off_is_nothing()
    {
        $this->assertSame([], AvailabilityDraft::intervals($this->day('09:00', '17:00', false, on: false)));
    }

    public function test_a_new_doctor_starts_on_weekdays_nine_to_five_monday_first()
    {
        $blank = AvailabilityDraft::blank();

        $this->assertSame([1, 2, 3, 4, 5, 6, 0], array_column($blank['days'], 'weekday'));
        $this->assertSame([true, true, true, true, true, false, false], array_column($blank['days'], 'on'));
        $this->assertSame('17:00', $blank['days'][0]['end']);
    }

    public function test_normalising_puts_the_days_in_the_editors_order_and_trims_reasons()
    {
        $days = array_map(fn (int $w) => ['weekday' => $w, 'on' => '1', 'start' => '09:00', 'end' => '17:00', 'lunch' => 0], [0, 6, 5, 4, 3, 2, 1]);

        $draft = AvailabilityDraft::normalize([
            'days' => $days,
            'timeOff' => [['id' => '', 'startDate' => '2026-11-01', 'endDate' => '2026-11-02', 'reason' => '  Leave ']],
            'blocked' => [['weekday' => '1', 'time' => '10:00']],
        ]);

        $this->assertSame([1, 2, 3, 4, 5, 6, 0], array_column($draft['days'], 'weekday'));
        $this->assertTrue($draft['days'][0]['on']);
        $this->assertNull($draft['timeOff'][0]['id']);
        $this->assertSame('Leave', $draft['timeOff'][0]['reason']);
        $this->assertSame(1, $draft['blocked'][0]['weekday']);
    }
}
