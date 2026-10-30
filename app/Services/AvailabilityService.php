<?php

namespace App\Services;

use App\Data\AvailabilityDraft;
use App\Enums\AppointmentStatus;
use App\Models\Appointment;
use App\Models\BlockedSlot;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\ScheduleRule;
use App\Models\TimeOff;
use App\Scheduling\SlotRules;
use App\Support\ClinicClock;
use Illuminate\Support\Facades\DB;

/**
 * A doctor's weekly hours, leave and closed half hours: read as the editor's draft, saved from it, previewed with the
 * booking rules. Saving replaces all three together.
 *
 * @phpstan-import-type Draft from AvailabilityDraft
 */
class AvailabilityService
{
    /**
     * The editor's form of what is stored. A day with no rows is off; two rows split at 13:00 and 14:00 are one day with
     * lunch on.
     *
     * @return Draft
     */
    public function draftOf(Doctor $doctor): array
    {
        $rules = ScheduleRule::query()->where('doctor_id', $doctor->id)->orderBy('start_time')->get()->groupBy('weekday');

        $days = array_map(function (int $weekday) use ($rules): array {
            $rows = $rules->get($weekday);

            if ($rows === null || $rows->isEmpty()) {
                return ['weekday' => $weekday, 'on' => false, 'start' => '09:00', 'end' => '13:00', 'lunch' => false];
            }

            $first = $rows->first();
            $last = $rows->last();

            return [
                'weekday' => $weekday,
                'on' => true,
                'start' => $first->start_time,
                'end' => $last->end_time,
                'lunch' => $rows->count() === 2 && $first->end_time === '13:00' && $last->start_time === '14:00',
            ];
        }, AvailabilityDraft::WEEK);

        return [
            'days' => $days,
            'timeOff' => array_values(TimeOff::query()->where('doctor_id', $doctor->id)->orderBy('start_date')->orderBy('id')->get()
                ->map(fn (TimeOff $off) => [
                    'id' => $off->id,
                    'startDate' => $off->start_date->format('Y-m-d'),
                    'endDate' => $off->end_date->format('Y-m-d'),
                    'reason' => $off->reason,
                ])->all()),
            'blocked' => array_values(BlockedSlot::query()->where('doctor_id', $doctor->id)->orderBy('weekday')->orderBy('time')->get()
                ->map(fn (BlockedSlot $slot) => ['weekday' => $slot->weekday, 'time' => $slot->time])->all()),
        ];
    }

    /**
     * Replace the doctor's hours, leave and closed half hours. Returns whether anything actually changed.
     *
     * @param  Draft  $draft  validated and normalised
     */
    public function save(Doctor $doctor, array $draft): bool
    {
        return DB::transaction(function () use ($doctor, $draft): bool {
            $before = $this->draftOf($doctor);

            ScheduleRule::query()->where('doctor_id', $doctor->id)->delete();

            foreach ($draft['days'] as $day) {
                foreach (AvailabilityDraft::intervals($day) as [$start, $end]) {
                    (new ScheduleRule)->forceFill([
                        'doctor_id' => $doctor->id,
                        'weekday' => $day['weekday'],
                        'start_time' => $start,
                        'end_time' => $end,
                    ])->save();
                }
            }

            $this->syncTimeOff($doctor, $draft['timeOff']);

            BlockedSlot::query()->where('doctor_id', $doctor->id)->delete();

            foreach ($draft['blocked'] as $slot) {
                (new BlockedSlot)->forceFill(['doctor_id' => $doctor->id, 'weekday' => $slot['weekday'], 'time' => $slot['time']])->save();
            }

            return $this->draftOf($doctor) !== $before;
        });
    }

    /**
     * What the draft would produce, by the booking rules, and (for an existing doctor) the bookings still to come that it would
     * leave outside their hours or on their leave. Nothing is saved and nothing is cancelled: the screen only warns.
     *
     * @param  Draft  $draft
     * @return array{slotsPerWeekday: list<int>, total: int, affected: list<array{appointmentId: string, patientName: string, startsAt: string}>}
     */
    public function preview(Clinic $clinic, array $draft, ?Doctor $doctor = null): array
    {
        $slots = SlotRules::slotsPerWeekday($draft['days'], $draft['blocked'], $clinic->settingsData()->businessHours);

        return ['slotsPerWeekday' => $slots, 'total' => array_sum($slots), 'affected' => $doctor === null ? [] : $this->affected($clinic, $doctor, $draft)];
    }

    /**
     * Booked or confirmed appointments still to come that would no longer fit: outside the day's hours or the clinic's, in
     * lunch, over a closed half hour, or on leave.
     *
     * @param  Draft  $draft
     * @return list<array{appointmentId: string, patientName: string, startsAt: string}>
     */
    private function affected(Clinic $clinic, Doctor $doctor, array $draft): array
    {
        $clock = ClinicClock::for($clinic);
        $days = [];

        foreach ($draft['days'] as $day) {
            $days[$day['weekday']] = $day;
        }

        $hours = [];

        foreach ($clinic->settingsData()->businessHours as $day) {
            $hours[$day['weekday']] = [SlotRules::minutes($day['open']), SlotRules::minutes($day['close'])];
        }

        $affected = [];

        $appointments = Appointment::query()->with(['patient', 'service'])->where('doctor_id', $doctor->id)
            ->whereIn('status', [AppointmentStatus::Booked->value, AppointmentStatus::Confirmed->value])
            ->where('starts_at', '>=', now())->orderBy('starts_at')->orderBy('id')->get();

        foreach ($appointments as $appointment) {
            $local = $clock->toLocal($appointment->starts_at);
            $date = $local->format('Y-m-d');
            $from = $local->hour * 60 + $local->minute;
            $to = $from + $appointment->service->duration_minutes;
            $day = $days[$local->dayOfWeek] ?? null;
            $open = $hours[$local->dayOfWeek] ?? null;

            $fits = $day !== null && $day['on'] && $open !== null
                && $from >= max(SlotRules::minutes($day['start']), $open[0]) && $to <= min(SlotRules::minutes($day['end']), $open[1])
                && ! ($day['lunch'] && $from < SlotRules::LUNCH_END && $to > SlotRules::LUNCH_START);

            foreach ($draft['blocked'] as $blocked) {
                $start = SlotRules::minutes($blocked['time']);

                if ($blocked['weekday'] === $local->dayOfWeek && $from < $start + 30 && $to > $start) {
                    $fits = false;
                }
            }

            $away = false;

            foreach ($draft['timeOff'] as $off) {
                $away = $away || ($off['startDate'] <= $date && $date <= $off['endDate']);
            }

            if (! $fits || $away) {
                $affected[] = ['appointmentId' => $appointment->id, 'patientName' => $appointment->patient->name, 'startsAt' => $appointment->starts_at->utc()->format('Y-m-d\TH:i:s.v\Z')];
            }
        }

        return $affected;
    }

    /**
     * Leave the editor kept (same id) is updated, new leave is created, leave it dropped is removed.
     *
     * @param  list<array{id: string|null, startDate: string, endDate: string, reason: string}>  $offs
     */
    private function syncTimeOff(Doctor $doctor, array $offs): void
    {
        $existing = TimeOff::query()->where('doctor_id', $doctor->id)->get()->keyBy('id');
        $keep = [];

        foreach ($offs as $off) {
            $row = $off['id'] !== null ? $existing->get($off['id']) : null;
            $row ??= new TimeOff;
            $row->forceFill(['doctor_id' => $doctor->id, 'start_date' => $off['startDate'], 'end_date' => $off['endDate'], 'reason' => $off['reason']])->save();
            $keep[] = $row->id;
        }

        $existing->except($keep)->each(fn (TimeOff $row) => $row->delete());
    }
}
