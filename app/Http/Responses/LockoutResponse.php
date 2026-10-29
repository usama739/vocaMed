<?php

namespace App\Http\Responses;

use Laravel\Fortify\Contracts\LockoutResponse as LockoutResponseContract;
use Laravel\Fortify\LoginRateLimiter;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * Too many failed sign-ins for this address and network. A 429 with Retry-After, which the JSON error
 * mapper turns into RATE_LIMITED, so the sign-in page can count down.
 */
class LockoutResponse implements LockoutResponseContract
{
    public function __construct(private readonly LoginRateLimiter $limiter) {}

    public function toResponse($request): never
    {
        $seconds = max(1, $this->limiter->availableIn($request));

        throw new TooManyRequestsHttpException($seconds, trans('auth.throttle', [
            'seconds' => $seconds,
            'minutes' => (int) ceil($seconds / 60),
        ]));
    }
}
