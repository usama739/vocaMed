<?php

namespace App\Booking;

use App\Exceptions\InvalidInput;
use App\Models\Doctor;
use App\Models\Service;

/**
 * Finds the doctor and service a request names, within the clinic, and checks they can be booked: both are switched on and the
 * doctor offers the service. An unknown id (or one from another clinic) is a 404; the rest are validation errors on the field.
 */
final class BookingTargets
{
    /**
     * @return array{0: Doctor, 1: Service}
     */
    public function resolve(string $doctorId, string $serviceId): array
    {
        $doctor = Doctor::query()->with('services')->findOrFail($doctorId);
        $service = Service::query()->findOrFail($serviceId);

        if (! $doctor->is_active) {
            throw new InvalidInput('That doctor is not taking bookings.', 'doctorId');
        }

        if (! $service->is_active) {
            throw new InvalidInput('That service is switched off.', 'serviceId');
        }

        if (! $doctor->services->contains('id', $service->id)) {
            throw new InvalidInput("{$doctor->display_name} does not offer {$service->name}.", 'serviceId');
        }

        return [$doctor, $service];
    }
}
