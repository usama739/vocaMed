<?php

namespace App\Jobs;

use App\Enums\VoiceStatus;
use App\Jobs\Middleware\RunInClinic;
use App\Models\Clinic;
use App\Models\VoiceRequest;
use App\Support\TenantContext;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use App\Voice\SpeechToTextManager;
use App\Voice\VoiceAudioStore;
use App\Voice\VoiceService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Turns a filed recording into text. It carries only the request's id and its clinic, works inside that clinic, and does nothing for a
 * request that is no longer waiting, so running it twice is harmless. A recording that cannot be read is failed at once with the reason;
 * a provider that is busy or down is tried again (three tries, a wait between) and then failed. Whatever happens, the recording is
 * deleted afterwards. On success the next job starts.
 */
class ProcessVoiceTranscriptionJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly string $voiceRequestId, public readonly string $clinicId) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [5, 20];
    }

    /**
     * @return list<object>
     */
    public function middleware(): array
    {
        return [new RunInClinic];
    }

    public function handle(SpeechToTextManager $speech, VoiceAudioStore $audio, VoiceService $voice): void
    {
        $request = VoiceRequest::query()->find($this->voiceRequestId);

        if ($request === null || ! in_array($request->status, [VoiceStatus::Queued, VoiceStatus::Transcribing], true)) {
            return;
        }

        $request->forceFill(['status' => VoiceStatus::Transcribing])->save();

        $contents = $request->audio_path === null ? null : $audio->get($request->audio_path);

        if ($contents === null) {
            $this->giveUp($request, 'audio_missing');

            return;
        }

        try {
            $text = trim($speech->driver()->transcribe(SpeechInput::forRecording($contents, (string) $request->audio_mime, prompt: $voice->speechPrompt())));
        } catch (SpeechFailed $failed) {
            if ($failed->retryable) {
                throw $failed;
            }

            $this->giveUp($request, $failed->reason);

            return;
        }

        if ($text === '') {
            $this->giveUp($request, 'no_speech');

            return;
        }

        $request->forceFill(['transcript' => $text, 'status' => VoiceStatus::Parsing])->save();

        PurgeVoiceAudioJob::dispatch($request->id, $this->clinicId);
        ProcessVoiceIntentJob::dispatch($request->id, $this->clinicId);
    }

    /** Out of tries: the request is failed, and the screen offers the typed box. */
    public function failed(Throwable $exception): void
    {
        $tenant = app(TenantContext::class);

        $tenant->run($tenant->bypass(fn (): Clinic => Clinic::query()->findOrFail($this->clinicId)), function () use ($exception): void {
            $request = VoiceRequest::query()->find($this->voiceRequestId);

            if ($request !== null && ! $request->status->isFinished()) {
                $this->giveUp($request, $exception instanceof SpeechFailed ? $exception->reason : 'provider_error');
            }
        });
    }

    private function giveUp(VoiceRequest $request, string $code): void
    {
        $request->markFailed($code);

        PurgeVoiceAudioJob::dispatch($request->id, $this->clinicId);
    }
}
