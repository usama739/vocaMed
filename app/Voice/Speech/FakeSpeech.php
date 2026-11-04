<?php

namespace App\Voice\Speech;

use App\Voice\Contracts\SpeechToText;
use App\Voice\SpeechInput;

/** Hears the same thing whatever it is played (`vocamed.voice.fake_transcript`), so everything around speech can run with no network. */
class FakeSpeech implements SpeechToText
{
    public function transcribe(SpeechInput $input): string
    {
        return (string) config('vocamed.voice.fake_transcript', '');
    }
}
