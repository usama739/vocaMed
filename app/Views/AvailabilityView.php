<?php

namespace App\Views;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Services\AvailabilityService;
use App\Support\ClinicClock;

/** `AvailabilityView`: a doctor's saved availability and its preview (the doctor's own page, C3). */
final class AvailabilityView
{
    public function __construct(private readonly AvailabilityService $availability) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, Doctor $doctor): array
    {
        $draft = $this->availability->draftOf($doctor);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'doctor' => DoctorView::of($doctor->loadMissing('services')),
            'draft' => $draft,
            'preview' => $this->availability->preview($clinic, $draft, $doctor),
        ];
    }
}
