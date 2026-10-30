<?php

namespace Tests\Unit;

use App\Scheduling\SlotRules;
use PHPUnit\Framework\TestCase;

class SlotRulesTest extends TestCase
{
    /**
     * @return array{weekday: int, on: bool, start: string, end: string, lunch: bool}
     */
    private function day(int $weekday = 1, bool $on = true, string $start = '09:00', string $end = '17:00', bool $lunch = false): array
    {
        return compact('weekday', 'on', 'start', 'end', 'lunch');
    }

    /** @return list<array{weekday: int, open: string, close: string}> */
    private function open(int ...$weekdays): array
    {
        return array_map(fn (int $weekday) => ['weekday' => $weekday, 'open' => '09:00', 'close' => '17:00'], $weekdays);
    }

    public function test_a_day_is_counted_in_half_hours()
    {
        $this->assertSame([16], SlotRules::slotsPerWeekday([$this->day()], [], $this->open(1)));
    }

    public function test_lunch_takes_out_the_hour_from_one_to_two()
    {
        $this->assertSame([14], SlotRules::slotsPerWeekday([$this->day(lunch: true)], [], $this->open(1)));
    }

    public function test_a_half_hour_closed_every_week_is_taken_out_only_on_its_weekday()
    {
        $days = [$this->day(1), $this->day(2)];

        $this->assertSame([15, 16], SlotRules::slotsPerWeekday($days, [['weekday' => 1, 'time' => '10:00']], $this->open(1, 2)));
    }

    public function test_a_day_that_is_off_has_none()
    {
        $this->assertSame([0], SlotRules::slotsPerWeekday([$this->day(on: false)], [], $this->open(1)));
    }

    public function test_the_clinics_business_hours_are_the_outer_limit()
    {
        $narrow = [['weekday' => 1, 'open' => '10:00', 'close' => '15:00']];

        $this->assertSame([10], SlotRules::slotsPerWeekday([$this->day()], [], $narrow));
    }

    public function test_a_day_the_clinic_is_closed_has_none_whatever_the_doctor_says()
    {
        $this->assertSame([0], SlotRules::slotsPerWeekday([$this->day(0)], [], $this->open(1, 2)));
    }

    public function test_hours_outside_the_editors_range_are_not_counted()
    {
        $allDay = [['weekday' => 1, 'open' => '00:00', 'close' => '24:00']];

        $this->assertSame([28], SlotRules::slotsPerWeekday([$this->day(start: '06:00', end: '20:00')], [], $allDay));
    }

    public function test_the_results_follow_the_order_of_the_days_given()
    {
        $days = [$this->day(1), $this->day(0, false), $this->day(3, end: '11:00')];

        $this->assertSame([16, 0, 4], SlotRules::slotsPerWeekday($days, [], $this->open(0, 1, 3)));
    }

    public function test_minutes_and_times_convert_both_ways()
    {
        $this->assertSame(570, SlotRules::minutes('09:30'));
        $this->assertSame('09:30', SlotRules::time(570));
        $this->assertSame('24:00', SlotRules::time(1440));
    }
}
