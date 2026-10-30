<?php

namespace App\Booking\Intake;

use App\Booking\BookingRequest;
use App\Booking\Contracts\IntakeDriver;
use App\Enums\BookingSource;
use Carbon\CarbonImmutable;

/**
 * The booking panel: a receptionist chose the patient, the doctor, the service and the time, and typed a reason. The source is
 * manual, walk-in, or voice (a spoken request the receptionist has reviewed and confirmed on the same panel).
 */
class TypedIntake implements IntakeDriver
{
    public function toRequest(array $input): BookingRequest
    {
        return new BookingRequest(
            patientId: (string) $input['patientId'],
            doctorId: (string) $input['doctorId'],
            serviceId: (string) $input['serviceId'],
            startsAt: CarbonImmutable::parse((string) $input['startsAt'])->utc(),
            source: BookingSource::from((string) ($input['source'] ?? BookingSource::Manual->value)),
            reason: $this->text($input['reason'] ?? null),
            notes: $this->text($input['notes'] ?? null),
        );
    }

    private function text(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';

        return $value === '' ? null : $value;
    }
}
