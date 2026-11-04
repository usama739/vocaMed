<?php

namespace App\Voice;

use App\Enums\VoiceSource;
use App\Enums\VoiceStatus;
use App\Jobs\ProcessVoiceIntentJob;
use App\Jobs\ProcessVoiceTranscriptionJob;
use App\Models\User;
use App\Models\VoiceRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Throwable;

/**
 * Accepts a spoken or typed booking request: files it as a `voice_requests` row, keeps the recording safe until it is read, and starts
 * the queued work. It answers at once; the words, the draft and any failure arrive later through the row.
 */
class VoiceRequests
{
    public function __construct(private readonly VoiceAudioStore $audio, private readonly SpeechBudget $budget) {}

    /**
     * A recording: stored encrypted, then transcribed and understood by queued jobs. With a real speech provider it first has to fit in
     * what that provider's free tier allows (a 429 with the wait otherwise); the fake driver costs nothing and is not limited.
     */
    public function acceptAudio(User $user, UploadedFile $file, float $seconds): VoiceRequest
    {
        if (config('vocamed.voice.speech_driver') !== 'fake') {
            $this->budget->reserve($seconds);
        }

        $id = (string) Str::ulid();
        $clinicId = (string) $user->clinic_id;
        $path = $this->audio->put($clinicId, $id, (string) $file->get());

        try {
            $request = $this->file($user, [
                'id' => $id,
                'source' => VoiceSource::Audio,
                'audio_path' => $path,
                'audio_mime' => $file->getMimeType() ?? 'audio/webm',
                'duration_seconds' => (int) ceil($seconds),
            ]);
        } catch (Throwable $e) {
            $this->audio->delete($path);

            throw $e;
        }

        ProcessVoiceTranscriptionJob::dispatch($request->id, $clinicId);

        return $request;
    }

    /** Typed text: there is nothing to transcribe, so it goes straight to being understood. */
    public function acceptText(User $user, string $text): VoiceRequest
    {
        $request = $this->file($user, ['source' => VoiceSource::Text, 'transcript' => trim($text)]);

        ProcessVoiceIntentJob::dispatch($request->id, (string) $user->clinic_id);

        return $request;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function file(User $user, array $attributes): VoiceRequest
    {
        $request = new VoiceRequest;
        $request->forceFill([...$attributes, 'user_id' => $user->id, 'clinic_id' => $user->clinic_id, 'status' => VoiceStatus::Queued])->save();

        return $request;
    }
}
