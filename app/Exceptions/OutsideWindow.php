<?php

namespace App\Exceptions;

/** A patient tried to change an appointment after the cancellation window closed, or after it started. */
class OutsideWindow extends DomainException
{
    public function __construct(string $message = 'It is too late to change this appointment online.')
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return 'OUTSIDE_WINDOW';
    }

    public function status(): int
    {
        return 403;
    }
}
