<?php

namespace App\Views\Reception;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\AppointmentView;
use App\Views\DoctorView;
use App\Views\PatientView;
use App\Views\ServiceView;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * `AppointmentRow` for a set of appointments: the appointment with its patient, doctor and service embedded, who booked it, and
 * what the person looking may do with it (`allowed`). The flags are asked of `AppointmentPolicy`, so the screens and the
 * endpoints can never disagree about who may do what; the client only reads them.
 */
final class AppointmentRows
{
    /**
     * @param  Collection<int, Appointment>  $appointments
     * @return array<int, array<string, mixed>>
     */
    public function of(Clinic $clinic, User $viewer, Collection $appointments): array
    {
        $appointments->loadMissing(['patient', 'doctor.services', 'service']);

        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $gate = Gate::forUser($viewer);
        $noShows = $this->noShows($appointments);
        $names = self::names($appointments->pluck('created_by')->filter()->map(fn ($id) => (string) $id)->unique()->values()->all());

        return $appointments->map(function (Appointment $appointment) use ($clock, $today, $gate, $noShows, $names): array {
            $appointment->patient->setAttribute('no_show_count', $noShows[$appointment->patient_id] ?? 0);

            $open = $appointment->status->isOpen();
            $transitions = array_filter($appointment->status->transitions(), fn ($to) => $gate->allows('changeStatus', [$appointment, $to]));

            return [
                'appointment' => AppointmentView::of($appointment),
                'patient' => PatientView::of($appointment->patient),
                'doctor' => DoctorView::of($appointment->doctor),
                'service' => ServiceView::of($appointment->service),
                'createdBy' => self::actor($appointment->created_by, $names),
                'allowed' => [
                    'transitions' => array_values(array_map(fn ($to) => $to->value, $transitions)),
                    'canUndo' => $appointment->status->previous() !== null
                        && $clock->dateOf($appointment->starts_at) === $today
                        && $gate->allows('undo', $appointment),
                    'canReschedule' => $open && $gate->allows('reschedule', $appointment),
                    'canCancel' => $open && $gate->allows('cancel', $appointment),
                ],
            ];
        })->values()->all();
    }

    /**
     * The names of staff, by user id, within the current clinic.
     *
     * @param  array<int, string>  $ids
     * @return array<string, string>
     */
    public static function names(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return User::query()->inCurrentClinic()->whereIn('id', $ids)->pluck('name', 'id')
            ->mapWithKeys(fn ($name, $id) => [(string) $id => (string) $name])->all();
    }

    /**
     * Who did something: a staff member, the patient (from their link) or the system.
     *
     * @param  array<string, string>  $names
     * @return array{kind: string, name: string|null}
     */
    public static function actor(?string $id, array $names): array
    {
        if ($id === 'patient') {
            return ['kind' => 'patient', 'name' => null];
        }

        if ($id !== null && isset($names[$id])) {
            return ['kind' => 'user', 'name' => $names[$id]];
        }

        return ['kind' => 'system', 'name' => null];
    }

    /**
     * No-show counts for the patients in these appointments, in one query.
     *
     * @param  Collection<int, Appointment>  $appointments
     * @return array<string, int>
     */
    private function noShows(Collection $appointments): array
    {
        $ids = $appointments->pluck('patient_id')->unique()->values()->all();

        if ($ids === []) {
            return [];
        }

        $counts = [];

        foreach (Appointment::query()->whereIn('patient_id', $ids)->where('status', 'no_show')
            ->groupBy('patient_id')->selectRaw('patient_id, count(*) as total')->get() as $row) {
            $counts[(string) $row->getAttribute('patient_id')] = (int) $row->getAttribute('total');
        }

        return $counts;
    }
}
