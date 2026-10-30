<?php

namespace App\Exceptions;

/** Not allowed for this person on this record (deactivating yourself, for one). Answers 403 `FORBIDDEN`. */
class Forbidden extends DomainException
{
    public function __construct(string $message = 'You cannot do that.')
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return 'FORBIDDEN';
    }

    public function status(): int
    {
        return 403;
    }
}
