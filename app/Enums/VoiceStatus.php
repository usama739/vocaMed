<?php

namespace App\Enums;

/** Where a voice request is on its way from a recording (or typed text) to a draft booking. */
enum VoiceStatus: string
{
    case Queued = 'queued';
    case Transcribing = 'transcribing';
    case Parsing = 'parsing';
    case Ready = 'ready';
    case Failed = 'failed';

    /** Nothing more will happen to it: the screen can stop asking. */
    public function isFinished(): bool
    {
        return $this === self::Ready || $this === self::Failed;
    }
}
