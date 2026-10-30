<?php

namespace App\Exceptions;

/** The clinic's last active admin cannot be deactivated: nobody would be left to manage it. */
class LastAdmin extends DomainException
{
    public function __construct()
    {
        parent::__construct('A clinic needs at least one active admin.');
    }

    public function errorCode(): string
    {
        return 'LAST_ADMIN';
    }

    public function status(): int
    {
        return 422;
    }
}
