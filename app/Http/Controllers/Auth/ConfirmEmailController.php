<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * The link in the sign-up email (signed and time-limited). Following it proves the address is the person's own,
 * and signs them in to their new workspace.
 */
class ConfirmEmailController extends Controller
{
    public function __invoke(Request $request, User $user, string $hash): RedirectResponse
    {
        abort_unless(hash_equals(sha1($user->email), $hash), 403);

        if ($user->email_verified_at === null) {
            $user->markEmailAsVerified();
        }

        if (! $user->loadMissing('clinic')->canSignIn()) {
            return redirect()->route('login');
        }

        Auth::login($user);
        $request->session()->regenerate();

        return redirect($user->role?->home() ?? '/');
    }
}
