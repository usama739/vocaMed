<?php

namespace App\Scheduling;

/**
 * The rules that say which half hours of a week a doctor can be booked in. The availability preview uses them now and
 * slot generation (M3) will use the same ones, so what the editor promises is what booking offers.
 *
 * A bookable half hour is one that: starts on the grid, lies inside the doctor's hours for that weekday, is not in the
 * lunch break (13:00 to 14:00, when switched on), is not one the doctor closed every week, and lies inside the clinic's
 * business hours (a day the clinic is closed has none).
 */
final class SlotRules
{
    public const GRID = 30;

    public const LUNCH_START = 13 * 60;

    public const LUNCH_END = 14 * 60;

    /** The editor never offers times outside these (06:00 to 20:00). */
    public const EARLIEST = 6 * 60;

    public const LATEST = 20 * 60;

    public static function minutes(string $time): int
    {
        return (int) substr($time, 0, 2) * 60 + (int) substr($time, 3, 2);
    }

    public static function time(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    /**
     * How many bookable half hours each day of the draft has, in the draft's order.
     *
     * @param  list<array{weekday: int, on: bool, start: string, end: string, lunch: bool}>  $days
     * @param  list<array{weekday: int, time: string}>  $blocked
     * @param  list<array{weekday: int, open: string, close: string}>  $businessHours  a weekday that is missing is closed
     * @return list<int>
     */
    public static function slotsPerWeekday(array $days, array $blocked, array $businessHours): array
    {
        $closed = [];

        foreach ($blocked as $slot) {
            $closed[$slot['weekday']][self::minutes($slot['time'])] = true;
        }

        $hours = [];

        foreach ($businessHours as $day) {
            $hours[$day['weekday']] = [self::minutes($day['open']), self::minutes($day['close'])];
        }

        return array_map(function (array $day) use ($closed, $hours): int {
            if (! $day['on'] || ! isset($hours[$day['weekday']])) {
                return 0;
            }

            [$open, $close] = $hours[$day['weekday']];
            $start = max(self::minutes($day['start']), $open, self::EARLIEST);
            $end = min(self::minutes($day['end']), $close, self::LATEST);
            $count = 0;

            for ($m = $start; $m + self::GRID <= $end; $m += self::GRID) {
                $lunch = $day['lunch'] && $m >= self::LUNCH_START && $m < self::LUNCH_END;

                if (! $lunch && ! isset($closed[$day['weekday']][$m])) {
                    $count++;
                }
            }

            return $count;
        }, $days);
    }
}
