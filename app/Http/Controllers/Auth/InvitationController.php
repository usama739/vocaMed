<?php

namespace App\Http\Controllers\Auth;

use App\Enums\InvitationState;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
use App\Services\InvitationService;
use Illuminate\Http\JsonResponse;

class InvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    /** What the accept page shows: the role and clinic for a live link, or why it does not work. */
    public function show(string $token): JsonResponse
    {
        $invitation = $this->invitations->find($token);
        $state = $this->invitations->stateOf($invitation);

        if ($invitation === null || $state !== InvitationState::Valid) {
            return response()->json(['state' => $state->value]);
        }

        return response()->json([
            'state' => $state->value,
            'role' => $invitation->role->value,
            'clinicName' => $invitation->clinic->name,
        ]);
    }

    public function accept(AcceptInvitationRequest $request, string $token): JsonResponse
    {
        $this->invitations->accept(
            $token,
            $request->string('name')->toString(),
            $request->string('password')->toString(),
        );

        return response()->json(['ok' => true]);
    }
}
