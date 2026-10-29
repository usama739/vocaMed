<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business rule said no. Each subclass carries the contract's error code and HTTP status
 * (docs/data-contract.md), and the JSON error mapper turns it into the body the pages read.
 * Pages translate from the code and the field, never from the message.
 */
abstract class DomainException extends RuntimeException
{
    /** The contract's `DataError.code`, for example `SLOT_UNAVAILABLE`. */
    abstract public function errorCode(): string;

    abstract public function status(): int;

    /** The form field the error belongs to, when there is one. */
    public function field(): ?string
    {
        return null;
    }

    /** One extra fact the page may need (for example the unknown template variable). */
    public function detail(): ?string
    {
        return null;
    }

    /**
     * Anything else the body must carry, for example the alternative slots.
     *
     * @return array<string, mixed>
     */
    public function extra(): array
    {
        return [];
    }
}
