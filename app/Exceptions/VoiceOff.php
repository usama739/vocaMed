<?php

namespace App\Exceptions;

/** Voice booking is switched off in this clinic's settings. Answers 403 `VOICE_OFF`; the booking panel then shows only the typed box. */
class VoiceOff extends DomainException
{
    public function __construct()
    {
        parent::__construct('Voice booking is switched off for this clinic.');
    }

    public function errorCode(): string
    {
        return 'VOICE_OFF';
    }

    public function status(): int
    {
        return 403;
    }
}
