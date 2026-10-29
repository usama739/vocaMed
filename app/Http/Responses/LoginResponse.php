<?php

namespace App\Http\Responses;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

/**
 * After signing in: JSON callers get the role (the page redirects itself), page visits go to the page they
 * were after, or to the first page of their role's area.
 */
class LoginResponse implements LoginResponseContract
{
    public function toResponse($request): JsonResponse|RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $home = $user->role?->home() ?? '/';

        return $request->wantsJson()
            ? response()->json(['ok' => true, 'role' => $user->role?->value, 'home' => $home])
            : redirect()->intended($home);
    }
}
