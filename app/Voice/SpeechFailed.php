<?php

namespace App\Voice;

use RuntimeException;

/**
 * A speech driver could not turn a recording into text. `reason` is the short code the screen can act on (`rate_limited`,
 * `unavailable`, `rejected`); `retryable` says whether the same recording may work a moment later.
 */
class SpeechFailed extends RuntimeException
{
    public function __construct(public readonly string $reason, public readonly bool $retryable = false)
    {
        parent::__construct("Speech to text failed: $reason.");
    }
}
