<?php

namespace App\Http\Requests\Voice;

/**
 * `POST /api/voice/transcribe`: a recording of up to `max_seconds` and `max_kilobytes`, and how long the browser says it ran. The server
 * cannot hear the length without decoding the file, so the size limit is what actually bounds the cost.
 */
class TranscribeVoiceRequest extends VoiceFormRequest
{
    /** The formats a browser's MediaRecorder produces (Chrome and Firefox: webm or ogg, Safari: mp4), plus the common plain ones. */
    private const AUDIO_TYPES = [
        'audio/webm', 'video/webm', 'audio/ogg', 'application/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/m4a',
        'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac',
    ];

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'audio' => ['required', 'file', 'max:'.(int) config('vocamed.voice.max_kilobytes'), 'mimetypes:'.implode(',', self::AUDIO_TYPES)],
            'durationSeconds' => ['required', 'numeric', 'gt:0', 'max:'.(int) config('vocamed.voice.max_seconds')],
        ];
    }
}
