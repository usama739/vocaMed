<?php

namespace App\Exceptions;

/** A doctor who already has a login cannot be invited again. Reported on the email field as a validation error. */
class DoctorAlreadyHasSignIn extends DomainException
{
    public function __construct()
    {
        parent::__construct('This doctor can already sign in.');
    }

    public function errorCode(): string
    {
        return 'VALIDATION';
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
