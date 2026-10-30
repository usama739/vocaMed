<?php

namespace App\Exceptions;

/** A message uses a {placeholder} that the system does not fill in. The unknown name is the detail. */
class UnknownVariable extends DomainException
{
    public function __construct(private readonly string $variable)
    {
        parent::__construct("The message uses an unknown placeholder: {{$variable}}.");
    }

    public function errorCode(): string
    {
        return 'UNKNOWN_VARIABLE';
    }

    public function status(): int
    {
        return 422;
    }

    public function field(): ?string
    {
        return 'body';
    }

    public function detail(): ?string
    {
        return $this->variable;
    }
}
