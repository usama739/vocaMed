<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\FailedPasswordResetLinkRequestResponse;
use Laravel\Fortify\Contracts\SuccessfulPasswordResetLinkRequestResponse;

/**
 * The answer to "send me a reset link" is the same whether or not the address has an account (and
 * whether or not a link was just sent), so the page can never be used to find out who is a customer.
 */
class ResetLinkRequestedResponse implements FailedPasswordResetLinkRequestResponse, SuccessfulPasswordResetLinkRequestResponse
{
    // Fortify builds this with the broker's status as an argument; it is deliberately never read.
    public function toResponse($request): JsonResponse|RedirectResponse
    {
        return $request->wantsJson()
            ? response()->json(['ok' => true])
            : back()->with('status', trans('passwords.sent'));
    }
}
