<?php

namespace App\PatientLinks;

use App\Booking\BookingService;
use App\Exceptions\InvalidTransition;
use App\Models\Appointment;
use App\Models\Doctor;
use App\Models\RescheduleRequest;
use App\Models\User;
use App\Services\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * A patient's request to move an appointment when the clinic approves changes, and the doctor's decision. A pending request is
 * only live while the appointment is still booked or confirmed at the time the patient asked about; if someone cancelled or moved
 * it meanwhile the request is stale and drops off every list.
 */
class RescheduleRequests
{
    public function __construct(private readonly BookingService $booking, private readonly Audit $audit) {}

    /**
     * Requests still waiting and still meaningful.
     *
     * @return Builder<RescheduleRequest>
     */
    public function pending(): Builder
    {
        return RescheduleRequest::query()->where('status', 'pending')
            ->whereHas('appointment', fn (Builder $a) => $a->whereIn('status', ['booked', 'confirmed'])
                ->whereColumn('appointments.starts_at', 'reschedule_requests.from_starts_at'));
    }

    public function hasPending(Appointment $appointment): bool
    {
        return $this->pending()->where('appointment_id', $appointment->id)->exists();
    }

    public function pendingCount(Doctor $doctor): int
    {
        return $this->pending()->where('doctor_id', $doctor->id)->count();
    }

    public function create(Appointment $appointment, CarbonImmutable $proposed): RescheduleRequest
    {
        return DB::transaction(function () use ($appointment, $proposed): RescheduleRequest {
            $request = new RescheduleRequest;
            $request->forceFill([
                'appointment_id' => $appointment->id,
                'patient_id' => $appointment->patient_id,
                'doctor_id' => $appointment->doctor_id,
                'from_starts_at' => $appointment->starts_at,
                'proposed_starts_at' => $proposed,
                'status' => 'pending',
            ])->save();

            $this->audit->record('request.created', $appointment, ['proposed' => $proposed->utc()->format('Y-m-d\TH:i:s.v\Z')]);

            return $request;
        });
    }

    /**
     * The doctor's answer. Approving moves the appointment through the booking engine (a time that has gone leaves the request
     * pending and answers with the nearest alternatives); a request is decided once.
     */
    public function decide(User $by, RescheduleRequest $request, string $decision, ?string $message): RescheduleRequest
    {
        if ($request->status !== 'pending') {
            throw new InvalidTransition('This request was already decided.');
        }

        $appointment = $request->appointment;

        if (! $this->pending()->whereKey($request->id)->exists()) {
            throw new InvalidTransition('This request is no longer valid: the appointment has changed.');
        }

        return DB::transaction(function () use ($by, $request, $appointment, $decision, $message): RescheduleRequest {
            if ($decision === 'approved') {
                $this->booking->reschedule($by->clinic, $by, $appointment, $request->proposed_starts_at->toImmutable()->utc());
            }

            $message = $message === null ? '' : trim($message);

            $request->forceFill([
                'status' => $decision,
                'message' => $message === '' ? null : $message,
                'decided_at' => now(),
                'decided_by' => (string) $by->id,
            ])->save();

            $this->audit->record('request.decided', $appointment, ['decision' => $decision]);

            return $request;
        });
    }
}
