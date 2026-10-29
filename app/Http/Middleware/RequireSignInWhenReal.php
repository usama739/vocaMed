<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sends people who are not signed in to the sign-in page, but only while real sign-in is switched on
 * (config vocamed.real_auth). Off, the staff pages are the open demo on mock data. Replaced by plain `auth`
 * plus role checks in F4.
 */
class RequireSignInWhenReal
{
    public function __construct(private readonly Authenticate $authenticate) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! config('vocamed.real_auth')) {
            return $next($request);
        }

        return $this->authenticate->handle($request, $next);
    }
}
