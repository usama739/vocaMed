<?php

namespace App\Exceptions;

/** Two things of the same kind in one clinic cannot share a name (two services called the same). */
class DuplicateName extends DomainException
{
    public function __construct()
    {
        parent::__construct('That name is already used.');
    }

    public function errorCode(): string
    {
        return 'DUPLICATE_NAME';
    }

    public function status(): int
    {
        return 422;
    }

    public function field(): ?string
    {
        return 'name';
    }
}
