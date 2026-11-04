<?php

namespace App\Http\Requests\Voice;

/** `POST /api/voice/parse-text`: a booking request typed into the booking panel's command box. */
class ParseVoiceTextRequest extends VoiceFormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'text' => ['required', 'string', 'min:2', 'max:'.(int) config('vocamed.voice.max_text_characters')],
        ];
    }
}
