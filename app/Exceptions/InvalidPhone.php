<?php

namespace App\Exceptions;

/** A phone number that cannot be one. */
class InvalidPhone extends DomainException
{
    public function __construct()
    {
        parent::__construct('Enter a valid phone number.');
    }

    public function errorCode(): string
    {
        return 'INVALID_PHONE';
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
