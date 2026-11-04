<?php

namespace App\Voice\Contracts;

use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;

/**
 * Audio in, text out. A driver wraps one provider (Groq's Whisper now, OpenAI's or our own server later, or a fake in tests); nothing
 * after it knows which one ran.
 */
interface SpeechToText
{
    /**
     * @throws SpeechFailed when the provider cannot give a transcript (the exception says whether trying again may help)
     */
    public function transcribe(SpeechInput $input): string;
}
