<?php

namespace App\Views\Reception;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Patient;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\PatientView;

/** `PatientDetailView` (B6): one patient and all of their appointments, newest first (up to 200). */
final class PatientDetailView
{
    public const MAX_APPOINTMENTS = 200;

    public function __construct(private readonly AppointmentRows $rows) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, Patient $patient): array
    {
        $appointments = Appointment::query()->where('patient_id', $patient->id)
            ->orderByDesc('starts_at')->orderByDesc('id')->limit(self::MAX_APPOINTMENTS)->get();
        $rows = $this->rows->of($clinic, $viewer, $appointments);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'patient' => PatientView::of($patient),
            'appointments' => $rows,
        ];
    }
}
