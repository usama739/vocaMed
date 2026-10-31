<?php

namespace App\Listeners;

use App\Events\AppointmentChanged;
use App\Messaging\Messenger;
use App\Models\Appointment;

/** Files the message a patient is owed when their appointment is booked, moved or cancelled (the confirmation, reschedule or cancellation). */
class FileAppointmentMessages
{
    public function __construct(private readonly Messenger $messenger) {}

    public function handle(AppointmentChanged $event): void
    {
        $kind = match ($event->change) {
            'booked' => 'confirmation',
            'rescheduled' => 'reschedule',
            'cancelled' => 'cancellation',
            default => null,
        };

        $appointment = Appointment::query()->with('patient')->find($event->appointmentId);

        if ($kind !== null && $appointment !== null) {
            $this->messenger->file($appointment, $kind);
        }
    }
}
