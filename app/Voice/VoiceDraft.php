<?php

namespace App\Voice;

use Carbon\CarbonImmutable;

/**
 * A request resolved to this clinic's real records: what the booking panel's review card shows. Each field the resolver is not sure of is
 * named in `lowConfidence` (`patient`, `doctor`, `service`, `time`) so the card can ask the receptionist to check it. A field that could not
 * be found at all is null (or empty for the patient's name and phone) and is always listed there too. Nothing here is booked.
 */
final class VoiceDraft
{
    /**
     * @param  list<string>  $lowConfidence
     */
    public function __construct(
        public readonly string $heard,
        public readonly ?string $patientId,
        public readonly string $patientName,
        public readonly string $phone,
        public readonly ?string $doctorId,
        public readonly ?string $serviceId,
        public readonly ?CarbonImmutable $startsAt,
        public readonly array $lowConfidence,
    ) {}

    /**
     * @return array{heard: string, patientId: string|null, patientName: string, phone: string, doctorId: string|null, serviceId: string|null, startsAt: string|null, lowConfidence: list<string>}
     */
    public function toArray(): array
    {
        return [
            'heard' => $this->heard,
            'patientId' => $this->patientId,
            'patientName' => $this->patientName,
            'phone' => $this->phone,
            'doctorId' => $this->doctorId,
            'serviceId' => $this->serviceId,
            'startsAt' => $this->startsAt?->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'lowConfidence' => $this->lowConfidence,
        ];
    }
}
