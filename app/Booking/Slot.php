<?php

namespace App\Booking;

use Carbon\CarbonImmutable;

/** One bookable (or held) time for a doctor and a service, as the screens' `Slot`. */
final class Slot
{
    public function __construct(
        public readonly string $doctorId,
        public readonly string $serviceId,
        public readonly CarbonImmutable $startsAt,
        public readonly CarbonImmutable $endsAt,
        public readonly bool $held = false,
        public readonly bool $heldByMe = false,
    ) {}

    /** Free, or held by the person asking (who may therefore book it). */
    public function isBookable(): bool
    {
        return ! $this->held || $this->heldByMe;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'doctorId' => $this->doctorId,
            'serviceId' => $this->serviceId,
            'startsAt' => $this->startsAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'endsAt' => $this->endsAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'state' => $this->held ? 'held' : 'free',
            ...($this->held ? ['heldByMe' => $this->heldByMe] : []),
        ];
    }
}
