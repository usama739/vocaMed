<?php

namespace App\Views\Doctor;

use App\Models\RescheduleRequest;

/** A reschedule request as the screens receive it (`RescheduleRequest` in lib/data/types.ts). */
final class RequestView
{
    /**
     * @return array{id: string, clinicId: string, appointmentId: string, patientId: string, doctorId: string, fromStartsAt: string, proposedStartsAt: string, status: string, message: string|null, createdAt: string, decidedAt: string|null}
     */
    public static function of(RescheduleRequest $request): array
    {
        $iso = fn ($at): string => $at->utc()->format('Y-m-d\TH:i:s.v\Z');

        return [
            'id' => $request->id,
            'clinicId' => $request->clinic_id,
            'appointmentId' => $request->appointment_id,
            'patientId' => $request->patient_id,
            'doctorId' => $request->doctor_id,
            'fromStartsAt' => $iso($request->from_starts_at),
            'proposedStartsAt' => $iso($request->proposed_starts_at),
            'status' => $request->status,
            'message' => $request->message,
            'createdAt' => $request->created_at === null ? '' : $iso($request->created_at),
            'decidedAt' => $request->decided_at === null ? null : $iso($request->decided_at),
        ];
    }
}
