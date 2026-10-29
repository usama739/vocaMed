<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

/**
 * Lets the reset page know, before showing the form, whether its link still works. Unknown, used and expired
 * links all answer "expired", so a link's history is never revealed.
 */
class PasswordResetStatusController extends Controller
{
    public function __invoke(Request $request, string $token): JsonResponse
    {
        $user = User::query()->where('email', strtolower(trim($request->string('email')->toString())))->first();

        $valid = $user !== null && Password::broker()->tokenExists($user, $token);

        return response()->json(['state' => $valid ? 'valid' : 'expired']);
    }
}
