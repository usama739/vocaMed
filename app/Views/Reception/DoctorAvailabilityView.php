<?php

namespace App\Views\Reception;

use App\Models\BlockedSlot;
use App\Models\Doctor;
use App\Models\ScheduleRule;
use App\Models\Service;
use App\Models\TimeOff;
use Illuminate\Support\Collection;

/**
 * `DoctorAvailability`: a doctor's working windows (a lunch break shows as a gap inside the window), leave and closed half
 * hours, as the calendar draws them. The editor's own form of the same data is `AvailabilityService::draftOf`.
 *
 * @phpstan-type Hours array{doctorId: string, windows: list<array{weekday: int, start: string, end: string, breaks: list<array{start: string, end: string}>}>, timeOff: list<array{id: string, doctorId: string, startDate: string, endDate: string, reason: string}>, blocked: list<array{weekday: int, time: string}>}
 */
final class DoctorAvailabilityView
{
    /**
     * @return Hours
     */
    public function of(Doctor $doctor): array
    {
        return $this->forDoctors(new Collection([$doctor]))[$doctor->id];
    }

    /**
     * @param  Collection<int, Doctor>  $doctors
     * @return array<string, Hours>
     */
    public function forDoctors(Collection $doctors): array
    {
        $ids = $doctors->pluck('id')->all();

        $rules = ScheduleRule::query()->whereIn('doctor_id', $ids)->orderBy('weekday')->orderBy('start_time')->get()->groupBy('doctor_id');
        $offs = TimeOff::query()->whereIn('doctor_id', $ids)->orderBy('start_date')->orderBy('id')->get()->groupBy('doctor_id');
        $blocked = BlockedSlot::query()->whereIn('doctor_id', $ids)->orderBy('weekday')->orderBy('time')->get()->groupBy('doctor_id');

        $out = [];

        foreach ($doctors as $doctor) {
            $windows = [];

            foreach (($rules->get($doctor->id) ?? new Collection)->groupBy('weekday') as $weekday => $rows) {
                $rows = $rows->values();
                $breaks = [];

                for ($i = 1; $i < $rows->count(); $i++) {
                    if ($rows[$i]->start_time > $rows[$i - 1]->end_time) {
                        $breaks[] = ['start' => $rows[$i - 1]->end_time, 'end' => $rows[$i]->start_time];
                    }
                }

                $windows[] = [
                    'weekday' => (int) $weekday,
                    'start' => $rows->first()->start_time,
                    'end' => $rows->last()->end_time,
                    'breaks' => $breaks,
                ];
            }

            $timeOff = [];

            foreach ($offs->get($doctor->id) ?? [] as $off) {
                /** @var TimeOff $off */
                $timeOff[] = [
                    'id' => $off->id,
                    'doctorId' => $off->doctor_id,
                    'startDate' => $off->start_date->format('Y-m-d'),
                    'endDate' => $off->end_date->format('Y-m-d'),
                    'reason' => $off->reason,
                ];
            }

            $closed = [];

            foreach ($blocked->get($doctor->id) ?? [] as $slot) {
                /** @var BlockedSlot $slot */
                $closed[] = ['weekday' => $slot->weekday, 'time' => $slot->time];
            }

            $out[$doctor->id] = ['doctorId' => $doctor->id, 'windows' => $windows, 'timeOff' => $timeOff, 'blocked' => $closed];
        }

        return $out;
    }

    /**
     * The first active service the doctor offers, by name: what a walk-in or a calendar click is booked under.
     *
     * @param  Collection<int, Service>  $services  already in name order
     */
    public static function defaultService(Doctor $doctor, Collection $services): ?Service
    {
        $offered = $doctor->services->pluck('id')->all();

        return $services->first(fn (Service $service) => $service->is_active && in_array($service->id, $offered, true));
    }
}
