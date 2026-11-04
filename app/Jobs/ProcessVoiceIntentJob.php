<?php

namespace App\Jobs;

use App\Enums\VoiceStatus;
use App\Jobs\Middleware\RunInClinic;
use App\Models\Clinic;
use App\Models\VoiceRequest;
use App\Support\TenantContext;
use App\Voice\IntentFailed;
use App\Voice\IntentParserManager;
use App\Voice\ParseContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Turns the words of a request into the fields of a booking and stores them, so the booking panel can show the draft. Typed requests
 * start here; spoken ones arrive from the transcription job. Like the other voice jobs it carries only ids, works inside the clinic and
 * does nothing for a request that is no longer waiting.
 */
class ProcessVoiceIntentJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly string $voiceRequestId, public readonly string $clinicId) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [2, 10];
    }

    /**
     * @return list<object>
     */
    public function middleware(): array
    {
        return [new RunInClinic];
    }

    public function handle(IntentParserManager $parser): void
    {
        $request = VoiceRequest::query()->find($this->voiceRequestId);

        if ($request === null || ! in_array($request->status, [VoiceStatus::Queued, VoiceStatus::Parsing], true)) {
            return;
        }

        if ($request->transcript === null || $request->transcript === '') {
            $request->markFailed('no_speech');

            return;
        }

        $request->forceFill(['status' => VoiceStatus::Parsing])->save();

        try {
            $intent = $parser->driver()->parse($request->transcript, ParseContext::forClinic($request->clinic));
        } catch (IntentFailed $failed) {
            if ($failed->retryable) {
                throw $failed;
            }

            $request->markFailed($failed->reason);

            return;
        }

        // `draft` is filled by the resolver (the next step); until then the screen gets the heard words only.
        $request->forceFill(['parsed_json' => ['fields' => $intent->toArray(), 'draft' => null], 'status' => VoiceStatus::Ready])->save();
    }

    /** Out of tries: the request is failed, and the screen offers the typed box. */
    public function failed(Throwable $exception): void
    {
        $tenant = app(TenantContext::class);

        $tenant->run($tenant->bypass(fn (): Clinic => Clinic::query()->findOrFail($this->clinicId)), function () use ($exception): void {
            $request = VoiceRequest::query()->find($this->voiceRequestId);

            if ($request !== null && ! $request->status->isFinished()) {
                $request->markFailed($exception instanceof IntentFailed ? $exception->reason : 'parse_error');
            }
        });
    }
}
