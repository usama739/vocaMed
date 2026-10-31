<?php

namespace App\Messaging;

use App\Enums\BookingSource;
use App\Exceptions\InvalidTransition;
use App\Jobs\SendMessage;
use App\Models\Appointment;
use App\Models\Message;
use App\Services\Audit;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Str;

/**
 * Files the messages a patient is owed (confirmation, reminder, reschedule, cancellation) and sends a failed one again. Each message is a
 * row, filed once per kind and visit time (a unique key), so a retry or a second scheduler tick can never send it twice; a job sends it.
 * A patient who has not consented, or who cannot be reached on their channel, gets a row recorded as failed with the reason, so
 * reception can see it rather than wonder.
 */
class Messenger
{
    public function __construct(private readonly Audit $audit) {}

    /**
     * File one message for the appointment. Returns null when nothing is owed (a walk-in is already at the desk) or it was filed already.
     *
     * @param  int|null  $hours  for a reminder, how many hours before the visit it is for
     */
    public function file(Appointment $appointment, string $kind, ?int $hours = null): ?Message
    {
        if ($appointment->source === BookingSource::WalkIn) {
            return null;
        }

        $starts = $appointment->starts_at->getTimestamp();
        $key = match ($kind) {
            'reminder' => "reminder:{$appointment->id}:{$hours}:{$starts}",
            'cancellation' => "cancellation:{$appointment->id}",
            default => "{$kind}:{$appointment->id}:{$starts}",
        };

        return $this->create($appointment, $kind, $key);
    }

    /**
     * Send a failed message again as a new one (the log never edits a failure into a success); the old row says it was sent again.
     */
    public function resend(Message $message): Message
    {
        if ($message->status !== 'failed' || $message->resent_at !== null) {
            throw new InvalidTransition('Only a failed message that has not been sent again can be resent.');
        }

        $appointment = $message->appointment;
        $fresh = $this->create($appointment, $message->kind, 'resend:'.Str::ulid()) ?? throw new InvalidTransition('That message could not be filed.');

        $message->forceFill(['resent_at' => now()])->save();
        $this->audit->record('appointment.message_resent', $appointment, ['kind' => $message->kind]);
        $this->audit->record('notification.resent', $fresh, ['of' => $message->id]);

        return $fresh;
    }

    private function create(Appointment $appointment, string $kind, string $key): ?Message
    {
        $patient = $appointment->patient;
        $channel = $patient->preferred_channel;
        $reason = match (true) {
            $patient->consent_at === null => 'no_consent',
            $channel === 'email' && trim((string) $patient->email) === '' => 'unreachable',
            $channel !== 'email' && trim((string) $patient->phone) === '' => 'unreachable',
            default => null,
        };

        try {
            $message = new Message;
            $message->forceFill([
                'appointment_id' => $appointment->id,
                'patient_id' => $patient->id,
                'kind' => $kind,
                'channel' => $channel,
                'status' => $reason === null ? 'queued' : 'failed',
                'failure_reason' => $reason,
                'dedupe_key' => $key,
            ])->save();
        } catch (UniqueConstraintViolationException) {
            return null;
        }

        if ($reason === null) {
            SendMessage::dispatch($message->id, $message->clinic_id)->afterCommit();
        }

        return $message;
    }
}
