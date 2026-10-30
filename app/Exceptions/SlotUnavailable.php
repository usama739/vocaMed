<?php

namespace App\Exceptions;

/** The time asked for cannot be booked (taken, held by someone else, outside hours, in the past). Carries the nearest alternatives. */
class SlotUnavailable extends DomainException
{
    /**
     * @param  list<array<string, mixed>>  $alternatives  the nearest bookable slots, as the screens' `Slot`
     */
    public function __construct(private readonly array $alternatives = [])
    {
        parent::__construct('That slot is no longer available.');
    }

    public function errorCode(): string
    {
        return 'SLOT_UNAVAILABLE';
    }

    public function status(): int
    {
        return 409;
    }

    public function extra(): array
    {
        return ['alternatives' => $this->alternatives];
    }
}
