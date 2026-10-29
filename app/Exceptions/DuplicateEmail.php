<?php

namespace App\Exceptions;

/** An invitation or a doctor's sign-in was asked for an address that already has an account. */
class DuplicateEmail extends DomainException
{
    public function __construct()
    {
        parent::__construct('That email address already has an account.');
    }

    public function errorCode(): string
    {
        return 'DUPLICATE_EMAIL';
    }

    public function status(): int
    {
        return 422;
    }

    public function field(): ?string
    {
        return 'email';
    }
}
