<?php

namespace App\Booking;

use Carbon\CarbonImmutable;

/** A two-minute "someone is booking this slot". `blockedUntil` is the end of the service plus its buffer. */
final class SlotHold
{
    public function __construct(
        public readonly string $id,
        public readonly string $clinicId,
        public readonly string $doctorId,
        public readonly string $serviceId,
        public readonly CarbonImmutable $startsAt,
        public readonly CarbonImmutable $blockedUntil,
        public readonly string $heldBy,
        public readonly CarbonImmutable $expiresAt,
    ) {}

    /**
     * The cells the hold keeps others out of.
     *
     * @return list<string>
     */
    public function cells(): array
    {
        return Cells::between($this->startsAt, $this->blockedUntil);
    }

    public function isExpired(CarbonImmutable $now): bool
    {
        return $this->expiresAt->lte($now);
    }

    /**
     * What the screens receive (`SlotHold`).
     *
     * @return array<string, string>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'clinicId' => $this->clinicId,
            'doctorId' => $this->doctorId,
            'serviceId' => $this->serviceId,
            'startsAt' => $this->startsAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'heldBy' => $this->heldBy,
            'expiresAt' => $this->expiresAt->utc()->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }

    /**
     * What is kept in the cache.
     *
     * @return array<string, string>
     */
    public function toStore(): array
    {
        return [
            'id' => $this->id,
            'clinicId' => $this->clinicId,
            'doctorId' => $this->doctorId,
            'serviceId' => $this->serviceId,
            'startsAt' => $this->startsAt->utc()->toIso8601String(),
            'blockedUntil' => $this->blockedUntil->utc()->toIso8601String(),
            'heldBy' => $this->heldBy,
            'expiresAt' => $this->expiresAt->utc()->toIso8601String(),
        ];
    }

    /**
     * @param  array<string, string>  $data
     */
    public static function fromStore(array $data): self
    {
        return new self(
            $data['id'],
            $data['clinicId'],
            $data['doctorId'],
            $data['serviceId'],
            CarbonImmutable::parse($data['startsAt'])->utc(),
            CarbonImmutable::parse($data['blockedUntil'])->utc(),
            $data['heldBy'],
            CarbonImmutable::parse($data['expiresAt'])->utc(),
        );
    }
}
