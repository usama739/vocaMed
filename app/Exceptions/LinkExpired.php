<?php

namespace App\Exceptions;

/** A patient acted on a link that no longer works (or never did). The read models answer `state: "expired"` instead. */
class LinkExpired extends DomainException
{
    public function __construct()
    {
        parent::__construct('This link has expired.');
    }

    public function errorCode(): string
    {
        return 'LINK_EXPIRED';
    }

    public function status(): int
    {
        return 410;
    }
}
