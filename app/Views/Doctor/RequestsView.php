<?php

namespace App\Views\Doctor;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\RescheduleRequest;
use App\Models\User;
use App\PatientLinks\RescheduleRequests;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\Reception\AppointmentRows;
use Illuminate\Database\Eloquent\Collection;

/**
 * `RequestsView` (C4): the doctor's reschedule requests, those still waiting (newest first) and the ones they have decided (up to
 * the last 50), each with its appointment as a row so the page can show who and when.
 */
final class RequestsView
{
    public const HISTORY = 50;

    public function __construct(private readonly AppointmentRows $rows, private readonly RescheduleRequests $requests) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, Doctor $doctor): array
    {
        $pending = $this->requests->pending()->where('doctor_id', $doctor->id)->orderByDesc('created_at')->orderByDesc('id')->get();
        $history = RescheduleRequest::query()->where('doctor_id', $doctor->id)->whereIn('status', ['approved', 'rejected'])
            ->orderByDesc('decided_at')->orderByDesc('id')->limit(self::HISTORY)->get();

        $appointments = Appointment::query()->whereIn('id', $pending->pluck('appointment_id')->merge($history->pluck('appointment_id'))->unique()->values()->all())->get();
        $rows = [];

        foreach ($this->rows->of($clinic, $viewer, new Collection($appointments->all())) as $row) {
            $rows[$row['appointment']['id']] = $row;
        }

        $pair = fn (RescheduleRequest $request): array => ['request' => RequestView::of($request), 'row' => $rows[$request->appointment_id]];

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'doctor' => DoctorView::of($doctor->loadMissing('services')),
            'pending' => $pending->map($pair)->values()->all(),
            'history' => $history->map($pair)->values()->all(),
        ];
    }
}
