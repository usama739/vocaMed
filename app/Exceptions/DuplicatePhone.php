<?php

namespace App\Exceptions;

/** Another patient of the clinic already has this phone number. */
class DuplicatePhone extends DomainException
{
    public function __construct()
    {
        parent::__construct('A patient with this phone number already exists.');
    }

    public function errorCode(): string
    {
        return 'DUPLICATE_PHONE';
    }

    public function status(): int
    {
        return 422;
    }

    public function field(): ?string
    {
        return 'phone';
    }
}
