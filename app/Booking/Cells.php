<?php

namespace App\Booking;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * A doctor's time is counted in 5-minute cells (durations and buffers are multiples of 5). An appointment owns every cell from
 * its start to the end of its buffer. A cell is named by its UTC start, `Y-m-d H:i:s`.
 */
final class Cells
{
    public const MINUTES = 5;

    /**
     * The cells from `$from` up to, not including, `$to`.
     *
     * @return list<string>
     */
    public static function between(CarbonInterface $from, CarbonInterface $to): array
    {
        $cells = [];
        $cursor = CarbonImmutable::instance($from)->utc();
        $end = CarbonImmutable::instance($to)->utc();

        while ($cursor->lt($end)) {
            $cells[] = $cursor->format('Y-m-d H:i:s');
            $cursor = $cursor->addMinutes(self::MINUTES);
        }

        return $cells;
    }
}
