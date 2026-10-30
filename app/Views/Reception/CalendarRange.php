<?php

namespace App\Views\Reception;

use Carbon\CarbonImmutable;

/** The clinic-local dates a calendar view covers: one day, the week (Monday to Sunday) or the whole month. */
final class CalendarRange
{
    /**
     * @return array{from: string, to: string}
     */
    public static function of(string $view, string $date): array
    {
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $date);
        $day ??= CarbonImmutable::parse($date);

        return match ($view) {
            'day' => ['from' => $date, 'to' => $date],
            'week' => [
                'from' => $day->subDays(($day->dayOfWeek + 6) % 7)->format('Y-m-d'),
                'to' => $day->subDays(($day->dayOfWeek + 6) % 7)->addDays(6)->format('Y-m-d'),
            ],
            default => ['from' => $day->startOfMonth()->format('Y-m-d'), 'to' => $day->endOfMonth()->format('Y-m-d')],
        };
    }
}
