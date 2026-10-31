<?php

namespace App\PatientLinks;

use App\Data\ClinicSettings;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\PatientLink;
use App\Models\Service;

/** What a link's token opened: the one appointment and the people and clinic around it, and whether the link still works. */
final class ResolvedLink
{
    public function __construct(
        public readonly PatientLink $link,
        public readonly Appointment $appointment,
        public readonly Clinic $clinic,
        public readonly Doctor $doctor,
        public readonly Service $service,
        public readonly Patient $patient,
        public readonly ClinicSettings $settings,
        public readonly bool $usable,
    ) {}
}
