<?php

namespace App\Voice;

use RuntimeException;

/** An intent parser could not read the text. `reason` is a short code; `retryable` is true only for a parser that depends on a service. */
class IntentFailed extends RuntimeException
{
    public function __construct(public readonly string $reason, public readonly bool $retryable = false)
    {
        parent::__construct("Could not read the request: $reason.");
    }
}
