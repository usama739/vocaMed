<?php

namespace App\Booking\Contracts;

use App\Booking\SlotHold;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Short-lived "someone is booking this slot" markers. A person holds one slot at a time (a new hold replaces the old one),
 * a hold lasts two minutes, and others cannot hold or book what overlaps it. Nothing here decides who is double booked:
 * that is the database's job. The implementation can be swapped (the cache store is a setting).
 */
interface SlotHolds
{
    /** Hold the slot for this person, replacing any hold they already have. Refused (SLOT_UNAVAILABLE) when someone else holds an overlap. */
    public function hold(Clinic $clinic, User $by, Doctor $doctor, Service $service, CarbonImmutable $startsAt): SlotHold;

    /** Release a hold, if it is this person's. */
    public function release(Clinic $clinic, User $by, string $holdId): void;

    /** Release whatever this person holds (after they book, say). */
    public function releaseFor(Clinic $clinic, User $by): void;

    /**
     * Every live hold of the clinic.
     *
     * @return list<SlotHold>
     */
    public function active(Clinic $clinic): array;
}
