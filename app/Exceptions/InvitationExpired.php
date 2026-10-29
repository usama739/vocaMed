<?php

namespace App\Exceptions;

/** The invitation link is past its seven days, was revoked, or does not exist. */
class InvitationExpired extends DomainException
{
    public function __construct()
    {
        parent::__construct('This invitation link is no longer valid.');
    }

    public function errorCode(): string
    {
        return 'INVITATION_EXPIRED';
    }

    public function status(): int
    {
        return 410;
    }
}
