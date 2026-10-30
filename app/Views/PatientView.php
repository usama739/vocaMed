<?php

namespace App\Views;

use App\Models\Patient;

/**
 * A patient as the screens receive it (`Patient` in lib/data/types.ts). A walk-in with no number has an empty phone, and the
 * no-show count is computed from their appointments (never stored, so it cannot drift).
 */
final class PatientView
{
    /**
     * @return array{id: string, clinicId: string, name: string, phone: string, preferredLocale: string, preferredChannel: string, consent: bool, noShowCount: int, notes: string, createdAt: string}
     */
    public static function of(Patient $patient): array
    {
        return [
            'id' => $patient->id,
            'clinicId' => $patient->clinic_id,
            'name' => $patient->name,
            'phone' => $patient->phone ?? '',
            'preferredLocale' => $patient->preferred_locale,
            'preferredChannel' => $patient->preferred_channel,
            'consent' => $patient->consent_at !== null,
            'noShowCount' => $patient->no_show_count ?? $patient->appointments()->where('status', 'no_show')->count(),
            'notes' => $patient->notes ?? '',
            'createdAt' => $patient->created_at?->utc()->format('Y-m-d\TH:i:s.v\Z') ?? '',
        ];
    }
}
