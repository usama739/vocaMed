<?php

namespace App\Voice;

use App\Voice\Contracts\SpeechToText;
use App\Voice\Speech\FakeSpeech;
use Illuminate\Support\Manager;

/**
 * The speech-to-text provider, chosen by `vocamed.voice.speech_driver` (Laravel's driver pattern, like mail and cache). `fake` answers
 * with fixed text. The Whisper driver for Groq, OpenAI or our own server is added as `createWhisperHttpDriver()` in the providers step.
 */
class SpeechToTextManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return (string) $this->config->get('vocamed.voice.speech_driver', 'fake');
    }

    public function createFakeDriver(): SpeechToText
    {
        return $this->container->make(FakeSpeech::class);
    }
}
