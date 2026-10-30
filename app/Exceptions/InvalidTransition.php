<?php

namespace App\Exceptions;

/** The appointment cannot move to that status from where it is (or there is nothing to undo). */
class InvalidTransition extends DomainException
{
    public function __construct(string $message = 'That change is not possible for this appointment.')
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return 'INVALID_TRANSITION';
    }

    public function status(): int
    {
        return 422;
    }
}
