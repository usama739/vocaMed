<?php

namespace App\Jobs;

use App\Jobs\Middleware\RunInClinic;
use App\Models\VoiceRequest;
use App\Voice\VoiceAudioStore;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Deletes a request's recording and notes when. Started as soon as the recording has been read (or has failed), so audio never waits
 * around; running it again is harmless. A daily sweep for recordings this job missed (a queue that was down), and keeping recordings
 * longer when a clinic's retention setting asks, arrive in the closing step.
 */
class PurgeVoiceAudioJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly string $voiceRequestId, public readonly string $clinicId) {}

    /**
     * @return list<object>
     */
    public function middleware(): array
    {
        return [new RunInClinic];
    }

    public function handle(VoiceAudioStore $audio): void
    {
        $request = VoiceRequest::query()->find($this->voiceRequestId);

        if ($request === null || $request->audio_path === null) {
            return;
        }

        $audio->delete($request->audio_path);

        $request->forceFill(['audio_path' => null, 'purged_at' => now()])->save();
    }
}
