<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\User;
use App\Support\ClinicClock;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Collection;

/**
 * One page of the clinic's appointments, filtered by clinic-local dates, doctor, patient, status or the patient's name or phone.
 * The appointments endpoint and the reception pages both read through it, so they can never disagree about what a filter means.
 */
class AppointmentSearch
{
    public const MAX_PER_PAGE = 100;

    /**
     * @param  array{from?: string, to?: string, doctorId?: string, patientId?: string, status?: string, patient?: string, sort?: string, page?: int, perPage?: int}  $filters  `from` and `to` are clinic-local dates, both inclusive
     * @param  User|null  $onlyOwnFor  a doctor, who only ever gets their own appointments
     * @return array{items: Collection<int, Appointment>, total: int, page: int, perPage: int}
     */
    public function page(Clinic $clinic, array $filters, ?User $onlyOwnFor = null, int $defaultPerPage = 20): array
    {
        $clock = ClinicClock::for($clinic);
        $query = Appointment::query();

        if ($onlyOwnFor !== null) {
            $query->whereIn('doctor_id', Doctor::query()->where('user_id', $onlyOwnFor->id)->select('id'));
        }

        isset($filters['from']) && $query->where('starts_at', '>=', $clock->startOfDay($filters['from']));
        isset($filters['to']) && $query->where('starts_at', '<', $clock->endOfDay($filters['to']));
        isset($filters['doctorId']) && $query->where('doctor_id', $filters['doctorId']);
        isset($filters['patientId']) && $query->where('patient_id', $filters['patientId']);
        isset($filters['status']) && $query->where('status', $filters['status']);

        if (isset($filters['patient']) && trim($filters['patient']) !== '') {
            $needle = trim($filters['patient']);
            $digits = PhoneNumber::searchDigits($needle);
            $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($needle)).'%';

            $query->whereIn('patient_id', Patient::query()
                ->where(function ($patients) use ($like, $digits) {
                    $patients->whereRaw("lower(name) like ? escape '!'", [$like]);

                    if (strlen($digits) >= 3) {
                        $patients->orWhere('phone', 'like', '%'.$digits.'%');
                    }
                })->select('id'));
        }

        $perPage = max(1, min(self::MAX_PER_PAGE, (int) ($filters['perPage'] ?? $defaultPerPage)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $total = (clone $query)->count();
        $direction = ($filters['sort'] ?? 'startsAt') === '-startsAt' ? 'desc' : 'asc';
        $items = $query->orderBy('starts_at', $direction)->orderBy('id', $direction)->forPage($page, $perPage)->get();

        return ['items' => $items, 'total' => $total, 'page' => $page, 'perPage' => $perPage];
    }
}
