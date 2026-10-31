<?php

namespace App\Events;

/** An appointment was booked, moved or cancelled (`$change` is `booked`, `rescheduled` or `cancelled`). Raised once the change is saved. */
final class AppointmentChanged
{
    public function __construct(public readonly string $appointmentId, public readonly string $change) {}
}
