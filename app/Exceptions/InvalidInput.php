<?php

namespace App\Exceptions;

/** A request that is well formed but breaks a rule (a doctor who does not offer the service). Reported as `VALIDATION` on a field. */
class InvalidInput extends DomainException
{
    public function __construct(string $message, private readonly string $fieldName)
    {
        parent::__construct($message);
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
        return $this->fieldName;
    }
}
