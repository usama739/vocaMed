<?php

namespace App\Views;

use App\Models\Doctor;

/** A doctor as the screens receive it (`Doctor` in lib/data/types.ts). Load `services` first to avoid a query each. */
final class DoctorView
{
    /**
     * @return array{id: string, clinicId: string, userId: string|null, name: string, specialty: string, languages: list<string>, serviceIds: list<string>, active: bool}
     */
    public static function of(Doctor $doctor): array
    {
        return [
            'id' => $doctor->id,
            'clinicId' => $doctor->clinic_id,
            'userId' => $doctor->user_id === null ? null : (string) $doctor->user_id,
            'name' => $doctor->display_name,
            'specialty' => $doctor->specialty,
            'languages' => $doctor->languages,
            'serviceIds' => array_values(array_map('strval', $doctor->services->pluck('id')->sort()->all())),
            'active' => $doctor->is_active,
        ];
    }
}
