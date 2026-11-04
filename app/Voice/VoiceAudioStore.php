<?php

namespace App\Voice;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;

/**
 * Where a recording waits between being uploaded and being transcribed: an encrypted file on a private disk, never under the public
 * folder and never in the database. It is deleted as soon as the words have been read.
 */
class VoiceAudioStore
{
    /** Saves the recording and returns where it is. */
    public function put(string $clinicId, string $requestId, string $contents): string
    {
        $path = "voice/$clinicId/$requestId.bin";

        Storage::disk($this->disk())->put($path, Crypt::encryptString($contents));

        return $path;
    }

    /** The recording, or null when it is gone (already deleted, or never written). */
    public function get(string $path): ?string
    {
        $stored = Storage::disk($this->disk())->get($path);

        return $stored === null ? null : Crypt::decryptString($stored);
    }

    public function delete(string $path): void
    {
        Storage::disk($this->disk())->delete($path);
    }

    private function disk(): string
    {
        return (string) config('vocamed.voice.disk', 'local');
    }
}
