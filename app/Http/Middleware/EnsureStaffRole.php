<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards a staff area: signed in, and in one of the roles the area is for. Use `EnsureStaffRole::for(Role::Doctor)`
 * on a route group; with no role it admits every signed-in staff member (the account page).
 *
 * Not signed in: the sign-in page (401 for JSON). Signed in as another role: a 403 `FORBIDDEN` for JSON, and for a page
 * a redirect to the person's own area, which is where they belong. Only while real sign-in is on (`vocamed.real_auth`,
 * always on in production); off, the staff pages are the open demo on mock data.
 */
class EnsureStaffRole
{
    public function __construct(private readonly Authenticate $authenticate) {}

    public static function for(Role ...$roles): string
    {
        return self::class.($roles === [] ? '' : ':'.implode(',', array_map(fn (Role $role) => $role->value, $roles)));
    }

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        if (! config('vocamed.real_auth')) {
            return $next($request);
        }

        return $this->authenticate->handle($request, function (Request $request) use ($next, $roles): Response {
            $user = $request->user();

            if ($roles === [] || ($user?->role !== null && in_array($user->role->value, $roles, true))) {
                return $next($request);
            }

            abort_if($request->expectsJson(), 403);

            return redirect($user?->role?->home() ?? '/');
        });
    }
}
