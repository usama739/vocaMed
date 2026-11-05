<?php

namespace App\Jobs;

use App\Jobs\Middleware\RunInClinic;
use App\Models\VoiceRequest;
use App\Voice\VoicePurger;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Deletes a request's recording as soon as it has been read (or has failed), unless the clinic keeps recordings for a few days and this
 * one was read successfully: then it waits for the daily sweep (`voice:purge`). Running it again is harmless.
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

    public function handle(VoicePurger $purger): void
    {
        $request = VoiceRequest::query()->find($this->voiceRequestId);

        if ($request !== null) {
            $purger->afterReading($request);
        }
    }
}
