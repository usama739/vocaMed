<?php

namespace Database\Factories;

use App\Enums\AppointmentStatus;
use App\Enums\BookingSource;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A bare appointment row for tests of reading and filtering. It does not take cells or check availability: book through
 * BookingService when a test is about the booking rules.
 *
 * @extends Factory<Appointment>
 */
class AppointmentFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $start = now()->addDay()->setTime(10, 0);

        return [
            'clinic_id' => Clinic::factory(),
            'doctor_id' => Doctor::factory(),
            'patient_id' => Patient::factory(),
            'service_id' => Service::factory(),
            'starts_at' => $start,
            'ends_at' => $start->copy()->addMinutes(30),
            'status' => AppointmentStatus::Booked,
            'source' => BookingSource::Manual,
            'created_by' => null,
        ];
    }

    /** All of its people and service belong to this clinic. */
    public function forClinic(Clinic $clinic, ?Doctor $doctor = null, ?Patient $patient = null, ?Service $service = null): static
    {
        return $this->state(fn (array $attributes) => [
            'clinic_id' => $clinic->id,
            'doctor_id' => $doctor === null ? Doctor::factory()->forClinic($clinic) : $doctor->id,
            'patient_id' => $patient === null ? Patient::factory()->forClinic($clinic) : $patient->id,
            'service_id' => $service === null ? Service::factory()->forClinic($clinic) : $service->id,
        ]);
    }

    public function status(AppointmentStatus $status): static
    {
        return $this->state(fn (array $attributes) => ['status' => $status]);
    }
}
