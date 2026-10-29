<?php

namespace App\Exceptions;

/** The current password given to confirm a sensitive change was wrong. */
class InvalidPassword extends DomainException
{
    public function __construct()
    {
        parent::__construct('That password is not right.');
    }

    public function errorCode(): string
    {
        return 'INVALID_PASSWORD';
    }

    public function status(): int
    {
        return 422;
    }

    public function field(): ?string
    {
        return 'current';
    }
}
