<?php

namespace App\Views;

use App\Models\Service;

/** A service as the screens receive it (`Service` in lib/data/types.ts). */
final class ServiceView
{
    /**
     * @return array{id: string, clinicId: string, name: string, durationMin: int, bufferMin: int, active: bool}
     */
    public static function of(Service $service): array
    {
        return [
            'id' => $service->id,
            'clinicId' => $service->clinic_id,
            'name' => $service->name,
            'durationMin' => $service->duration_minutes,
            'bufferMin' => $service->buffer_minutes,
            'active' => $service->is_active,
        ];
    }
}
