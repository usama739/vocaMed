<?php

namespace App\Booking\Contracts;

use App\Booking\BookingRequest;

/**
 * One way of asking for a booking. A driver turns whatever its channel produced into the BookingRequest the engine understands,
 * and nothing more: every rule (availability, holds, the guard, audit) lives in BookingService. Typed entry is the first driver;
 * voice is added later as another, with no change to the engine.
 */
interface IntakeDriver
{
    /**
     * @param  array<string, mixed>  $input  what this channel collected (for typed entry: the validated form)
     */
    public function toRequest(array $input): BookingRequest;
}
