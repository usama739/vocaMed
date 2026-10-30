<?php

namespace App\Booking;

use App\Enums\BookingSource;
use Carbon\CarbonImmutable;

/**
 * The one thing the booking engine understands: who, with whom, for what, when, and how it was asked for. However a booking
 * is requested (typed into the booking panel now, spoken later) an intake driver turns it into this; the engine never knows
 * which.
 */
final class BookingRequest
{
    public function __construct(
        public readonly string $patientId,
        public readonly string $doctorId,
        public readonly string $serviceId,
        public readonly CarbonImmutable $startsAt,
        public readonly BookingSource $source,
        public readonly ?string $reason = null,
        public readonly ?string $notes = null,
    ) {}

    /** A walk-in is already at the desk: it starts arrived and never refuses a busy or past time. */
    public function isWalkIn(): bool
    {
        return $this->source === BookingSource::WalkIn;
    }
}
