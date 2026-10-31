<?php

namespace App\Views\Reception;

use App\Models\Clinic;
use App\Models\Message;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\MessageView;
use App\Views\PatientView;

/** `NotificationsView` (B7): the messages the clinic has sent (or tried to), newest first, up to the last 500, each with its patient. */
final class NotificationsView
{
    public const MAX_ROWS = 500;

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic): array
    {
        $messages = Message::query()->with('patient')->orderByDesc('created_at')->orderByDesc('id')->limit(self::MAX_ROWS)->get();

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'rows' => $messages->map(fn (Message $message) => [
                'entry' => MessageView::of($message),
                'patient' => PatientView::of($message->patient),
            ])->values()->all(),
        ];
    }
}
