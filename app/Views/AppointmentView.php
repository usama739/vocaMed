<?php

namespace App\Views;

use App\Models\Appointment;

/** An appointment as the screens receive it (`Appointment` in lib/data/types.ts). */
final class AppointmentView
{
    /**
     * @return array{id: string, clinicId: string, patientId: string, doctorId: string, serviceId: string, startsAt: string, endsAt: string, status: string, source: string, reason: string|null, notes: string|null, createdAt: string, createdBy: string}
     */
    public static function of(Appointment $appointment): array
    {
        return [
            'id' => $appointment->id,
            'clinicId' => $appointment->clinic_id,
            'patientId' => $appointment->patient_id,
            'doctorId' => $appointment->doctor_id,
            'serviceId' => $appointment->service_id,
            'startsAt' => $appointment->starts_at->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'endsAt' => $appointment->ends_at->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'status' => $appointment->status->value,
            'source' => $appointment->source->value,
            'reason' => $appointment->reason,
            'notes' => $appointment->notes,
            'createdAt' => $appointment->created_at?->utc()->format('Y-m-d\TH:i:s.v\Z') ?? '',
            'createdBy' => $appointment->created_by ?? 'system',
        ];
    }
}
