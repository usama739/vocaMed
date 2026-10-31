<?php

namespace App\Views;

use App\Models\Message;

/** A message as the screens receive it (`NotificationLogEntry` in lib/data/types.ts). The two optional keys are left out when not set. */
final class MessageView
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Message $message): array
    {
        $iso = fn ($at): string => $at->utc()->format('Y-m-d\TH:i:s.v\Z');

        return [
            'id' => $message->id,
            'clinicId' => $message->clinic_id,
            'appointmentId' => $message->appointment_id,
            'patientId' => $message->patient_id,
            'kind' => $message->kind,
            'channel' => $message->channel,
            'status' => $message->status,
            'createdAt' => $message->created_at === null ? '' : $iso($message->created_at),
            'sentAt' => $message->sent_at === null ? null : $iso($message->sent_at),
            ...($message->failure_reason === null ? [] : ['failureReason' => $message->failure_reason]),
            ...($message->resent_at === null ? [] : ['resentAt' => $iso($message->resent_at)]),
        ];
    }
}
