<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Fortify\Fortify;

/**
 * Decides whether a sign-in attempt becomes a session. A wrong password, an unknown address, an
 * inactive person, a suspended clinic and an unconfirmed address all end the same way (null, so the page
 * says "wrong email or password"), so nothing here tells an outsider which addresses have accounts.
 */
class AuthenticateUser
{
    private static ?string $decoy = null;

    public function __invoke(Request $request): ?User
    {
        $email = strtolower(trim((string) $request->input(Fortify::username())));
        $password = (string) $request->input('password');

        $user = User::query()->with('clinic')->where('email', $email)->first();

        $passwordOk = Hash::check($password, $user !== null ? $user->password : self::decoy());

        return $user !== null && $passwordOk && $user->canSignIn() ? $user : null;
    }

    /** A real hash to compare against when the address is unknown, so both paths take about as long. */
    private static function decoy(): string
    {
        return self::$decoy ??= Hash::make(Str::random(40));
    }
}
