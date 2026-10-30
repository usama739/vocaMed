<?php

namespace App\Data;

use App\Scheduling\SlotRules;
use Illuminate\Contracts\Validation\Validator;

/**
 * What the availability editor edits and saves together: seven days of hours (Monday first), leave, and the half hours a
 * doctor keeps closed every week. Validation and normalisation live here so the doctor's own page, the admin's page and
 * the preview all accept exactly the same thing.
 *
 * @phpstan-type Day array{weekday: int, on: bool, start: string, end: string, lunch: bool}
 * @phpstan-type Off array{id: string|null, startDate: string, endDate: string, reason: string}
 * @phpstan-type Block array{weekday: int, time: string}
 * @phpstan-type Draft array{days: list<Day>, timeOff: list<Off>, blocked: list<Block>}
 */
final class AvailabilityDraft
{
    /** The editor lists Monday first. */
    public const WEEK = [1, 2, 3, 4, 5, 6, 0];

    /**
     * @return array<string, array<int, mixed>>
     */
    public static function rules(string $prefix = ''): array
    {
        $p = $prefix === '' ? '' : "$prefix.";
        $hour = '/^((0[6-9]|1[0-9]):(00|30)|20:00)$/';
        $half = '/^(0[6-9]|1[0-9]):(00|30)$/';

        return [
            "{$p}days" => ['required', 'array', 'size:7'],
            "{$p}days.*.weekday" => ['required', 'integer', 'between:0,6', 'distinct'],
            "{$p}days.*.on" => ['required', 'boolean'],
            "{$p}days.*.start" => ['required', 'string', "regex:$hour"],
            "{$p}days.*.end" => ['required', 'string', "regex:$hour"],
            "{$p}days.*.lunch" => ['required', 'boolean'],
            "{$p}timeOff" => ['present', 'array', 'max:200'],
            "{$p}timeOff.*.id" => ['nullable', 'string', 'max:40'],
            "{$p}timeOff.*.startDate" => ['required', 'date_format:Y-m-d'],
            "{$p}timeOff.*.endDate" => ['required', 'date_format:Y-m-d'],
            "{$p}timeOff.*.reason" => ['nullable', 'string', 'max:255'],
            "{$p}blocked" => ['present', 'array', 'max:400'],
            "{$p}blocked.*.weekday" => ['required', 'integer', 'between:0,6'],
            "{$p}blocked.*.time" => ['required', 'string', "regex:$half"],
        ];
    }

    /**
     * The rules that compare two fields: a working day ends after it starts, leave ends on or after it starts, and a
     * half hour is not closed twice.
     *
     * @param  array<string, mixed>  $draft  the draft as sent
     */
    public static function checkOrder(Validator $validator, array $draft, string $prefix = ''): void
    {
        $p = $prefix === '' ? '' : "$prefix.";

        foreach ((array) ($draft['days'] ?? []) as $i => $day) {
            if (is_array($day) && ($day['on'] ?? false) && isset($day['start'], $day['end']) && $day['start'] >= $day['end']) {
                $validator->errors()->add("{$p}days.$i.end", 'Working hours are not valid.');
            }
        }

        foreach ((array) ($draft['timeOff'] ?? []) as $i => $off) {
            if (is_array($off) && isset($off['startDate'], $off['endDate']) && $off['endDate'] < $off['startDate']) {
                $validator->errors()->add("{$p}timeOff.$i.endDate", 'Time off dates are not valid.');
            }
        }

        $seen = [];

        foreach ((array) ($draft['blocked'] ?? []) as $i => $slot) {
            $key = is_array($slot) ? ($slot['weekday'] ?? '').'|'.($slot['time'] ?? '') : '';

            if (isset($seen[$key])) {
                $validator->errors()->add("{$p}blocked.$i.time", 'That time is already closed.');
            }

            $seen[$key] = true;
        }
    }

    /**
     * The validated draft in the form the service works with.
     *
     * @param  array<string, mixed>  $draft
     * @return Draft
     */
    public static function normalize(array $draft): array
    {
        $days = array_map(fn (array $day) => [
            'weekday' => (int) $day['weekday'],
            'on' => (bool) $day['on'],
            'start' => (string) $day['start'],
            'end' => (string) $day['end'],
            'lunch' => (bool) $day['lunch'],
        ], array_values($draft['days']));

        usort($days, fn (array $a, array $b) => array_search($a['weekday'], self::WEEK, true) <=> array_search($b['weekday'], self::WEEK, true));

        return [
            'days' => $days,
            'timeOff' => array_map(fn (array $off) => [
                'id' => isset($off['id']) && $off['id'] !== '' ? (string) $off['id'] : null,
                'startDate' => (string) $off['startDate'],
                'endDate' => (string) $off['endDate'],
                'reason' => trim((string) ($off['reason'] ?? '')),
            ], array_values($draft['timeOff'])),
            'blocked' => array_map(fn (array $slot) => ['weekday' => (int) $slot['weekday'], 'time' => (string) $slot['time']], array_values($draft['blocked'])),
        ];
    }

    /**
     * What a doctor who does not exist yet starts with: weekdays, nine to five.
     *
     * @return Draft
     */
    public static function blank(): array
    {
        return [
            'days' => array_map(fn (int $weekday) => $weekday >= 1 && $weekday <= 5
                ? ['weekday' => $weekday, 'on' => true, 'start' => '09:00', 'end' => '17:00', 'lunch' => false]
                : ['weekday' => $weekday, 'on' => false, 'start' => '09:00', 'end' => '13:00', 'lunch' => false], self::WEEK),
            'timeOff' => [],
            'blocked' => [],
        ];
    }

    /**
     * The working intervals a day makes, with the lunch break taken out: one, two, or none.
     *
     * @param  Day  $day
     * @return list<array{0: string, 1: string}>
     */
    public static function intervals(array $day): array
    {
        if (! $day['on']) {
            return [];
        }

        $start = SlotRules::minutes($day['start']);
        $end = SlotRules::minutes($day['end']);

        if (! $day['lunch']) {
            return [[$day['start'], $day['end']]];
        }

        $intervals = [];

        if ($start < SlotRules::LUNCH_START) {
            $intervals[] = [$day['start'], SlotRules::time(min($end, SlotRules::LUNCH_START))];
        }

        if ($end > SlotRules::LUNCH_END) {
            $intervals[] = [SlotRules::time(max($start, SlotRules::LUNCH_END)), $day['end']];
        }

        return array_values(array_filter($intervals, fn (array $i) => SlotRules::minutes($i[0]) < SlotRules::minutes($i[1])));
    }
}
