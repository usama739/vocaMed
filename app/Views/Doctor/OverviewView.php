<?php

namespace App\Views\Doctor;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\Reception\AppointmentRows;
use Carbon\CarbonImmutable;

/**
 * `DoctorOverviewView` (C1): the doctor's own appointments today in time order, how many of the next 30 days they have anything on,
 * and the reschedule requests waiting for them (none until patients can ask for one).
 */
final class OverviewView
{
    public function __construct(private readonly AppointmentRows $rows) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, Doctor $doctor): array
    {
        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $day = fn (int $offset): string => CarbonImmutable::parse($today)->addDays($offset)->format('Y-m-d');

        $todays = Appointment::query()->where('doctor_id', $doctor->id)
            ->where('starts_at', '>=', $clock->startOfDay($today))->where('starts_at', '<', $clock->endOfDay($today))
            ->orderBy('starts_at')->orderBy('id')->get();

        $ahead = Appointment::query()->where('doctor_id', $doctor->id)->where('status', '!=', 'cancelled')
            ->where('starts_at', '>=', $clock->startOfDay($day(1)))->where('starts_at', '<', $clock->endOfDay($day(30)))
            ->get(['starts_at']);
        $days = [];

        foreach ($ahead as $appointment) {
            $days[$clock->dateOf($appointment->starts_at)] = true;
        }

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $today,
            'doctor' => DoctorView::of($doctor->loadMissing('services')),
            'rows' => $this->rows->of($clinic, $viewer, $todays),
            'daysAhead' => count($days),
            'pendingRequests' => 0,
        ];
    }
}
