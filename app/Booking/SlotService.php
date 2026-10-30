<?php

namespace App\Booking;

use App\Booking\Contracts\SlotHolds;
use App\Exceptions\SlotUnavailable;
use App\Models\BlockedSlot;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\ScheduleRule;
use App\Models\Service;
use App\Models\TimeOff;
use App\Models\User;
use App\Scheduling\SlotRules;
use App\Support\ClinicClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * When a doctor can be booked for a service: the slots of a day, the nearest alternatives to a time, the next free slot.
 *
 * A slot is offered when it lies inside the doctor's hours for that weekday and inside the clinic's business hours, outside
 * lunch and the half hours the doctor keeps closed, on the service-length steps from the start of each working interval,
 * in the future, on a day that is neither a clinic holiday nor the doctor's leave, and none of its cells (the service plus
 * its buffer) is taken by an appointment. A slot someone is holding is still listed, marked held.
 */
class SlotService
{
    /** How far ahead alternatives and "next free" look. */
    private const ALTERNATIVE_DAYS = 7;

    private const NEXT_FREE_DAYS = 14;

    public function __construct(private readonly SlotHolds $holds) {}

    /**
     * The slots of one clinic-local date, in time order.
     *
     * @param  string|null  $ignoreAppointmentId  an appointment whose own time does not count as taken (when moving it)
     * @return list<Slot>
     */
    public function slots(Clinic $clinic, Doctor $doctor, Service $service, string $date, ?string $ignoreAppointmentId = null, ?User $viewer = null): array
    {
        $clock = ClinicClock::for($clinic);

        if ($this->isClosed($doctor, $date)) {
            return [];
        }

        $weekday = (int) CarbonImmutable::createFromFormat('!Y-m-d', $date, $clinic->timezone)?->dayOfWeek;
        $hours = collect($clinic->settingsData()->businessHours)->firstWhere('weekday', $weekday);

        if ($hours === null) {
            return [];
        }

        $open = SlotRules::minutes($hours['open']);
        $close = SlotRules::minutes($hours['close']);
        $duration = $service->duration_minutes;
        $buffer = $service->buffer_minutes;
        $blocked = BlockedSlot::query()->where('doctor_id', $doctor->id)->where('weekday', $weekday)->pluck('time')->map(fn (string $t) => SlotRules::minutes($t))->values()->all();
        $now = CarbonImmutable::now();

        $dayStart = $clock->startOfDay($date);
        $occupied = $this->occupiedCells($doctor, $dayStart, $clock->endOfDay($date)->addMinutes($buffer + 60), $ignoreAppointmentId);
        $held = $this->heldCells($clinic, $doctor);

        $slots = [];

        foreach (ScheduleRule::query()->where('doctor_id', $doctor->id)->where('weekday', $weekday)->orderBy('start_time')->get() as $rule) {
            $from = max(SlotRules::minutes($rule->start_time), $open, SlotRules::EARLIEST);
            $to = min(SlotRules::minutes($rule->end_time), $close, SlotRules::LATEST);

            for ($m = $from; $m + $duration <= $to; $m += $duration) {
                if ($this->overlapsClosedHalfHour($m, $m + $duration, $blocked)) {
                    continue;
                }

                $start = $clock->toInstant($date, SlotRules::time($m));

                if ($start->lt($now)) {
                    continue;
                }

                $end = $start->addMinutes($duration);
                $cells = Cells::between($start, $end->addMinutes($buffer));

                if ($this->anyIn($cells, $occupied)) {
                    continue;
                }

                $holder = $this->holderOf($cells, $held);
                $slots[] = new Slot($doctor->id, $service->id, $start, $end, $holder !== null, $holder === (string) $viewer?->id);
            }
        }

        usort($slots, fn (Slot $a, Slot $b) => $a->startsAt <=> $b->startsAt);

        return $slots;
    }

    /** Refuse unless `$startsAt` is a slot this person can book now, answering with the nearest alternatives. */
    public function assertBookable(Clinic $clinic, Doctor $doctor, Service $service, CarbonImmutable $startsAt, ?string $ignoreAppointmentId = null, ?User $viewer = null): void
    {
        $date = ClinicClock::for($clinic)->dateOf($startsAt);

        foreach ($this->slots($clinic, $doctor, $service, $date, $ignoreAppointmentId, $viewer) as $slot) {
            if ($slot->startsAt->equalTo($startsAt) && $slot->isBookable()) {
                return;
            }
        }

        throw new SlotUnavailable($this->alternatives($clinic, $doctor, $service, $startsAt, 3, $ignoreAppointmentId, $viewer));
    }

    /**
     * The bookable slots nearest to a time within the next week, nearest first (never the time itself).
     *
     * @return list<array<string, mixed>>
     */
    public function alternatives(Clinic $clinic, Doctor $doctor, Service $service, CarbonImmutable $startsAt, int $count = 3, ?string $ignoreAppointmentId = null, ?User $viewer = null): array
    {
        $clock = ClinicClock::for($clinic);
        $first = CarbonImmutable::createFromFormat('!Y-m-d', $clock->dateOf($startsAt), $clinic->timezone);
        $candidates = [];

        for ($d = 0; $d < self::ALTERNATIVE_DAYS && $first !== null; $d++) {
            foreach ($this->slots($clinic, $doctor, $service, $first->addDays($d)->format('Y-m-d'), $ignoreAppointmentId, $viewer) as $slot) {
                if ($slot->isBookable() && ! $slot->startsAt->equalTo($startsAt)) {
                    $candidates[] = $slot;
                }
            }
        }

        usort($candidates, fn (Slot $a, Slot $b) => abs($a->startsAt->diffInSeconds($startsAt, false)) <=> abs($b->startsAt->diffInSeconds($startsAt, false)));

        return array_map(fn (Slot $slot) => $slot->toArray(), array_slice($candidates, 0, $count));
    }

    /** The first free slot in the next two weeks, if any. */
    public function nextFree(Clinic $clinic, Doctor $doctor, Service $service): ?Slot
    {
        // A doctor with no working hours at all has nothing to look through.
        if (! ScheduleRule::query()->where('doctor_id', $doctor->id)->exists()) {
            return null;
        }

        $today = CarbonImmutable::createFromFormat('!Y-m-d', ClinicClock::for($clinic)->today(), $clinic->timezone);

        for ($d = 0; $d < self::NEXT_FREE_DAYS && $today !== null; $d++) {
            foreach ($this->slots($clinic, $doctor, $service, $today->addDays($d)->format('Y-m-d')) as $slot) {
                if (! $slot->held) {
                    return $slot;
                }
            }
        }

        return null;
    }

    /** A holiday, or the doctor's leave. */
    private function isClosed(Doctor $doctor, string $date): bool
    {
        return ClinicHoliday::query()->whereDate('date', $date)->exists()
            || TimeOff::query()->where('doctor_id', $doctor->id)->whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)->exists();
    }

    /**
     * @param  array<int, int>  $blocked  the starts (minutes) of the half hours the doctor keeps closed that weekday
     */
    private function overlapsClosedHalfHour(int $from, int $to, array $blocked): bool
    {
        foreach ($blocked as $start) {
            if ($from < $start + 30 && $to > $start) {
                return true;
            }
        }

        return false;
    }

    /**
     * Cells an active appointment of this doctor owns in a window, as a set.
     *
     * @return array<string, true>
     */
    private function occupiedCells(Doctor $doctor, CarbonImmutable $from, CarbonImmutable $to, ?string $ignoreAppointmentId): array
    {
        $rows = DB::table('appointment_slots')->where('doctor_id', $doctor->id)
            ->where('cell_start', '>=', $from->format('Y-m-d H:i:s'))->where('cell_start', '<', $to->format('Y-m-d H:i:s'))
            ->when($ignoreAppointmentId !== null, fn ($query) => $query->where('appointment_id', '!=', $ignoreAppointmentId))
            ->pluck('cell_start');

        $set = [];

        foreach ($rows as $cell) {
            $set[(string) $cell] = true;
        }

        return $set;
    }

    /**
     * Cells held for this doctor, by who holds them.
     *
     * @return array<string, string> cell => holder's user id
     */
    private function heldCells(Clinic $clinic, Doctor $doctor): array
    {
        $cells = [];

        foreach ($this->holds->active($clinic) as $hold) {
            if ($hold->doctorId !== $doctor->id) {
                continue;
            }

            foreach ($hold->cells() as $cell) {
                $cells[$cell] = $hold->heldBy;
            }
        }

        return $cells;
    }

    /**
     * @param  list<string>  $cells
     * @param  array<string, true>  $set
     */
    private function anyIn(array $cells, array $set): bool
    {
        foreach ($cells as $cell) {
            if (isset($set[$cell])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Who holds any of these cells (the viewer's own hold wins, so they can still book it).
     *
     * @param  list<string>  $cells
     * @param  array<string, string>  $held
     */
    private function holderOf(array $cells, array $held): ?string
    {
        $holder = null;

        foreach ($cells as $cell) {
            if (isset($held[$cell])) {
                $holder = $held[$cell];
            }
        }

        return $holder;
    }
}
