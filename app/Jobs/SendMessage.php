<?php

namespace App\Jobs;

use App\Messaging\DeliveryFailed;
use App\Messaging\MessageChannels;
use App\Messaging\MessageRenderer;
use App\Messaging\OutgoingMessage;
use App\Models\Clinic;
use App\Models\Message;
use App\Support\TenantContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Sends one filed message. It carries only the message's id and its clinic (a queued job has no signed-in person), works inside that
 * clinic, and does nothing for a message that is no longer waiting, so running it twice never sends twice. A message that can never be
 * delivered is marked failed with the reason; anything else is tried again (three tries, a wait between), and a message that is still
 * failing then is marked failed too.
 */
class SendMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly string $messageId, public readonly string $clinicId) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(TenantContext $tenant, MessageChannels $channels, MessageRenderer $renderer): void
    {
        $tenant->run($this->clinic($tenant), function () use ($channels, $renderer): void {
            $message = Message::query()->with(['appointment', 'patient'])->find($this->messageId);

            if ($message === null || $message->status !== 'queued') {
                return;
            }

            $appointment = $message->appointment;

            // A reminder for a visit that is no longer on (cancelled or moved on) has nothing to say; it was never sent, so it is not kept.
            if ($message->kind !== 'cancellation' && ! $appointment->status->isOpen()) {
                $message->delete();

                return;
            }

            $built = $renderer->render($appointment, $message->kind, $message->channel);
            $to = $message->channel === 'email' ? (string) $message->patient->email : (string) $message->patient->phone;

            try {
                $channels->for($message->channel)->send(new OutgoingMessage($message->channel, $to, $built['subject'], $built['body']));
            } catch (DeliveryFailed $failed) {
                $message->forceFill(['status' => 'failed', 'failure_reason' => $failed->reason])->save();

                return;
            }

            $message->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
        });
    }

    /** Out of tries: the message is failed, and reception sees it with Resend. */
    public function failed(Throwable $exception): void
    {
        $tenant = app(TenantContext::class);

        $tenant->run($this->clinic($tenant), function (): void {
            Message::query()->whereKey($this->messageId)->where('status', 'queued')->update(['status' => 'failed', 'failure_reason' => 'unreachable']);
        });
    }

    private function clinic(TenantContext $tenant): Clinic
    {
        return $tenant->bypass(fn (): Clinic => Clinic::query()->findOrFail($this->clinicId));
    }
}
