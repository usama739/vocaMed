<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes the signed-in person's clinic the one every clinic query is limited to, from the session and nothing the
 * request says. Runs before route binding, so `/things/{thing}` for another clinic's record is simply not found.
 * Signed out, no clinic is set and clinic tables refuse to be read.
 */
class SetTenantContext
{
    public function __construct(private readonly TenantContext $tenant) {}

    public function handle(Request $request, Closure $next): Response
    {
        $clinic = $request->user()?->clinic;

        // Always decided afresh: a long-lived worker must never carry one request's clinic into the next.
        $clinic !== null ? $this->tenant->set($clinic) : $this->tenant->forget();

        return $next($request);
    }
}
