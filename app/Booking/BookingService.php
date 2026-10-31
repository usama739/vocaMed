<?php

namespace App\Booking;

use App\Booking\Contracts\SlotHolds;
use App\Enums\AppointmentStatus;
use App\Events\AppointmentChanged;
use App\Exceptions\InvalidTransition;
use App\Exceptions\SlotUnavailable;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Services\Audit;
use App\Support\ClinicClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Every rule of booking, in one place, and nothing about how a booking was asked for (typed, spoken, from a patient link):
 * that arrives as a BookingRequest from an intake driver.
 *
 * Nobody is double booked, in two layers: the booking runs in a transaction that locks the doctor and checks the slot is
 * still bookable, and the `appointment_slots` table has a unique index on (doctor, 5-minute cell), so the database itself
 * refuses an overlap even if a path forgot to check. A scheduled appointment owns the cells from its start to the end of its
 * buffer while it is active (booked, confirmed, arrived, in consultation). Walk-ins own none: they are already at the desk.
 */
class BookingService
{
    public function __construct(
        private readonly SlotService $slots,
        private readonly SlotHolds $holds,
        private readonly BookingTargets $targets,
        private readonly Audit $audit,
    ) {}

    public function book(Clinic $clinic, User $by, BookingRequest $request): Appointment
    {
        $patient = Patient::query()->findOrFail($request->patientId);
        [$doctor, $service] = $this->targets->resolve($request->doctorId, $request->serviceId);

        $appointment = $this->persist($clinic, $by, $request, $patient, $doctor, $service);

        // The booker's own hold has done its job.
        $this->holds->releaseFor($clinic, $by);

        event(new AppointmentChanged($appointment->id, 'booked'));

        return $appointment;
    }

    /** Move an appointment that is still to come (booked or confirmed) to another bookable time. It goes back to booked. */
    public function reschedule(Clinic $clinic, ?User $by, Appointment $appointment, CarbonImmutable $startsAt): Appointment
    {
        if (! $appointment->status->isOpen()) {
            throw new InvalidTransition("Cannot reschedule a {$appointment->status->value} appointment.");
        }

        $doctor = $appointment->doctor;
        $service = $appointment->service;
        $from = $appointment->starts_at->utc();

        try {
            DB::transaction(function () use ($clinic, $by, $appointment, $doctor, $service, $startsAt, $from): void {
                $this->lockDoctor($doctor);
                $this->slots->assertBookable($clinic, $doctor, $service, $startsAt, $appointment->id, $by);

                $this->releaseCells($appointment);

                $appointment->forceFill([
                    'starts_at' => $startsAt,
                    'ends_at' => $startsAt->addMinutes($service->duration_minutes),
                    'status' => AppointmentStatus::Booked,
                ])->save();

                $this->takeCells($appointment, $doctor, $service);
                $this->audit->record('appointment.rescheduled', $appointment, [
                    'from' => $from->format('Y-m-d\TH:i:s.v\Z'),
                    'to' => $startsAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            throw new SlotUnavailable($this->slots->alternatives($clinic, $doctor, $service, $startsAt, 3, $appointment->id, $by));
        }

        // The booker's own hold has done its job (a patient moving their own appointment holds nothing).
        $by !== null && $this->holds->releaseFor($clinic, $by);

        event(new AppointmentChanged($appointment->id, 'rescheduled'));

        return $appointment;
    }

    /** Cancel: from booked, confirmed or arrived. The time is free to book again at once. */
    public function cancel(Appointment $appointment): Appointment
    {
        $this->assertMove($appointment, AppointmentStatus::Cancelled);

        $cancelled = DB::transaction(function () use ($appointment): Appointment {
            $appointment->forceFill(['status' => AppointmentStatus::Cancelled])->save();
            $this->releaseCells($appointment);
            $this->audit->record('appointment.cancelled', $appointment);

            return $appointment;
        });

        event(new AppointmentChanged($cancelled->id, 'cancelled'));

        return $cancelled;
    }

    /**
     * Move an appointment to another stage of its day. Cancelling goes through `cancel()`. Finishing, or marking a no-show,
     * gives the doctor's time back.
     */
    public function setStatus(Appointment $appointment, AppointmentStatus $to): Appointment
    {
        if ($to === AppointmentStatus::Cancelled) {
            return $this->cancel($appointment);
        }

        $this->assertMove($appointment, $to);
        $from = $appointment->status;

        return DB::transaction(function () use ($appointment, $to, $from): Appointment {
            $appointment->forceFill(['status' => $to])->save();

            if (! $to->holdsTime()) {
                $this->releaseCells($appointment);
            }

            $this->audit->record('appointment.status_changed', $appointment, ['status' => $to->value, 'from' => $from->value]);

            return $appointment;
        });
    }

    /** "Press again to undo": step a status back one stage, but only on the day of the appointment (clinic time). */
    public function undo(Clinic $clinic, Appointment $appointment): Appointment
    {
        $previous = $appointment->status->previous();
        $clock = ClinicClock::for($clinic);

        if ($previous === null || $clock->dateOf($appointment->starts_at) !== $clock->today()) {
            throw new InvalidTransition("Nothing to undo for a {$appointment->status->value} appointment.");
        }

        $from = $appointment->status;

        try {
            return DB::transaction(function () use ($appointment, $previous, $from): Appointment {
                $appointment->forceFill(['status' => $previous])->save();

                // Coming back from done or no-show takes the doctor's time again (a walk-in never owned any).
                if (! $from->holdsTime() && $previous->holdsTime() && $appointment->source->value !== 'walk_in') {
                    $this->lockDoctor($appointment->doctor);
                    $this->takeCells($appointment, $appointment->doctor, $appointment->service);
                }

                $this->audit->record('appointment.status_reverted', $appointment, ['status' => $previous->value, 'from' => $from->value]);

                return $appointment;
            });
        } catch (UniqueConstraintViolationException) {
            throw new SlotUnavailable;
        }
    }

    private function persist(Clinic $clinic, User $by, BookingRequest $request, Patient $patient, Doctor $doctor, Service $service): Appointment
    {
        $end = $request->startsAt->addMinutes($service->duration_minutes);

        try {
            return DB::transaction(function () use ($clinic, $by, $request, $patient, $doctor, $service, $end): Appointment {
                if (! $request->isWalkIn()) {
                    $this->lockDoctor($doctor);
                    $this->slots->assertBookable($clinic, $doctor, $service, $request->startsAt, null, $by);
                }

                $appointment = new Appointment;
                $appointment->forceFill([
                    'patient_id' => $patient->id,
                    'doctor_id' => $doctor->id,
                    'service_id' => $service->id,
                    'starts_at' => $request->startsAt,
                    'ends_at' => $end,
                    'status' => $request->isWalkIn() ? AppointmentStatus::Arrived : AppointmentStatus::Booked,
                    'source' => $request->source,
                    'reason' => $request->reason,
                    'notes' => $request->notes,
                    'created_by' => (string) $by->id,
                ])->save();

                if (! $request->isWalkIn()) {
                    $this->takeCells($appointment, $doctor, $service);
                }

                $this->audit->record('appointment.created', $appointment, ['source' => $request->source->value]);

                return $appointment;
            });
        } catch (UniqueConstraintViolationException) {
            // The database refused an overlap the check did not see (two bookings at the same instant): the slot is taken.
            throw new SlotUnavailable($this->slots->alternatives($clinic, $doctor, $service, $request->startsAt, 3, null, $by));
        }
    }

    /** Serialise bookings for one doctor for the length of the transaction. */
    private function lockDoctor(Doctor $doctor): void
    {
        Doctor::query()->whereKey($doctor->id)->lockForUpdate()->first();
    }

    private function takeCells(Appointment $appointment, Doctor $doctor, Service $service): void
    {
        $cells = Cells::between($appointment->starts_at, $appointment->starts_at->copy()->addMinutes($service->duration_minutes + $service->buffer_minutes));

        DB::table('appointment_slots')->insert(array_map(
            fn (string $cell) => ['appointment_id' => $appointment->id, 'doctor_id' => $doctor->id, 'cell_start' => $cell],
            $cells,
        ));
    }

    private function releaseCells(Appointment $appointment): void
    {
        DB::table('appointment_slots')->where('appointment_id', $appointment->id)->delete();
    }

    private function assertMove(Appointment $appointment, AppointmentStatus $to): void
    {
        if (! $appointment->status->canMoveTo($to)) {
            throw new InvalidTransition("Cannot change {$appointment->status->value} to {$to->value}.");
        }
    }
}
