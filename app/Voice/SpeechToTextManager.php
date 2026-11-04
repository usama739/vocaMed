<?php

namespace App\Voice;

use App\Voice\Contracts\SpeechToText;
use App\Voice\Speech\FakeSpeech;
use App\Voice\Speech\WhisperHttpSpeech;
use Illuminate\Support\Manager;

/**
 * The speech-to-text provider, chosen by `vocamed.voice.speech_driver` (Laravel's driver pattern, like mail and cache). `whisper_http`
 * is any OpenAI-compatible audio API (Groq's Whisper now; OpenAI's or our own server later, by settings); `fake` answers with fixed text.
 */
class SpeechToTextManager extends Manager
{
    public function getDefaultDriver(): string
    {
        return (string) $this->config->get('vocamed.voice.speech_driver', 'fake');
    }

    public function createWhisperHttpDriver(): SpeechToText
    {
        $speech = (array) $this->config->get('vocamed.voice.speech', []);
        $language = (string) ($speech['language'] ?? '');

        return new WhisperHttpSpeech(
            (string) ($speech['base_url'] ?? ''),
            (string) ($speech['api_key'] ?? ''),
            (string) ($speech['model'] ?? 'whisper-large-v3-turbo'),
            $language === '' ? null : $language,
            (int) ($speech['timeout'] ?? 30),
        );
    }

    public function createFakeDriver(): SpeechToText
    {
        return $this->container->make(FakeSpeech::class);
    }
}
