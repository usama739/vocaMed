<?php

namespace App\Views;

use App\Models\Invitation;

/** An invitation as the screens receive it (`Invitation` in lib/data/types.ts). */
final class InvitationView
{
    /**
     * @return array{id: string, clinicId: string, email: string, role: string, doctorId: string|null, status: string, sentAt: string, expiresAt: string}
     */
    public static function of(Invitation $invitation): array
    {
        return [
            'id' => $invitation->id,
            'clinicId' => $invitation->clinic_id,
            'email' => $invitation->email,
            'role' => $invitation->role->value,
            'doctorId' => $invitation->doctor_id,
            'status' => match (true) {
                $invitation->accepted_at !== null => 'accepted',
                $invitation->revoked_at !== null => 'revoked',
                $invitation->expires_at->isPast() => 'expired',
                default => 'pending',
            },
            'sentAt' => $invitation->updated_at?->utc()->format('Y-m-d\TH:i:s.v\Z') ?? '',
            'expiresAt' => $invitation->expires_at->utc()->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }
}
