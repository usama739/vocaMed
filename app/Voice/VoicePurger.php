<?php

namespace App\Voice;

use App\Models\Clinic;
use App\Models\VoiceRequest;
use App\Support\TenantContext;
use Illuminate\Support\Carbon;

/**
 * What a clinic's voice requests keep, and for how long.
 *
 * A recording is only needed until its words have been read, so it is deleted at once, unless the clinic chose to keep recordings for a
 * few days (Settings, 7 or 30) and the recording was read successfully; then the daily sweep deletes it when it gets old. A recording that
 * was never read (the queue was down) goes when it is an hour old whatever the setting says. The written transcript and the fields that
 * were understood hold names and phone numbers, so they are erased after `transcript_days` (30); the row itself stays, with its length and
 * outcome, so use can still be counted.
 */
class VoicePurger
{
    public function __construct(private readonly VoiceAudioStore $audio, private readonly TenantContext $tenant) {}

    /** Deletes the recording and notes when. Safe to run again. */
    public function deleteAudio(VoiceRequest $request): void
    {
        if ($request->audio_path === null) {
            return;
        }

        $this->audio->delete($request->audio_path);

        $request->forceFill(['audio_path' => null, 'purged_at' => now()])->save();
    }

    /**
     * Called right after a recording has been read (or has failed): deletes it, unless the clinic keeps recordings and this one was read
     * successfully (it then waits for the sweep).
     */
    public function afterReading(VoiceRequest $request): void
    {
        $days = $request->clinic->settingsData()->voiceAudioRetentionDays;

        if ($days > 0 && $request->transcript !== null) {
            return;
        }

        $this->deleteAudio($request);
    }

    /**
     * The daily sweep over every clinic, each by its own setting.
     *
     * @return array{recordings: int, transcripts: int}
     */
    public function sweep(): array
    {
        $counts = ['recordings' => 0, 'transcripts' => 0];

        $this->tenant->eachClinic(function (Clinic $clinic) use (&$counts): void {
            $days = $clinic->settingsData()->voiceAudioRetentionDays;
            $audioBefore = $days > 0 ? Carbon::now()->subDays($days) : Carbon::now()->subHours((int) config('vocamed.voice.stale_audio_hours', 1));
            $transcriptsBefore = Carbon::now()->subDays((int) config('vocamed.voice.transcript_days', 30));

            // Recordings kept for the clinic's few days (or stranded by a queue that was down) and now old enough to go. A recording
            // that was not read is stranded whatever the clinic's setting, so it goes by the shorter rule.
            VoiceRequest::query()->whereNotNull('audio_path')->where('created_at', '<', $audioBefore)->each(function (VoiceRequest $request) use (&$counts): void {
                $this->deleteAudio($request);
                $counts['recordings']++;
            });

            VoiceRequest::query()->whereNotNull('audio_path')->whereNull('transcript')
                ->where('created_at', '<', Carbon::now()->subHours((int) config('vocamed.voice.stale_audio_hours', 1)))
                ->each(function (VoiceRequest $request) use (&$counts): void {
                    $this->deleteAudio($request);
                    $counts['recordings']++;
                });

            $counts['transcripts'] += VoiceRequest::query()
                ->where('created_at', '<', $transcriptsBefore)
                ->where(fn ($q) => $q->whereNotNull('transcript')->orWhereNotNull('parsed_json'))
                ->update(['transcript' => null, 'parsed_json' => null]);
        });

        return $counts;
    }
}
