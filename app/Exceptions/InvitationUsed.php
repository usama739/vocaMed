<?php

namespace App\Exceptions;

/** The invitation was already accepted, or its address already has an account. */
class InvitationUsed extends DomainException
{
    public function __construct()
    {
        parent::__construct('This invitation has already been used.');
    }

    public function errorCode(): string
    {
        return 'INVITATION_USED';
    }

    public function status(): int
    {
        return 410;
    }
}
