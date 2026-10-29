<?php

namespace App\Http\Controllers;

use App\Enums\AccountNotification;
use App\Http\Requests\Account\ChangePasswordRequest;
use App\Http\Requests\Account\SetNotificationRequest;
use App\Http\Requests\Account\SignOutOthersRequest;
use App\Http\Requests\Account\UpdateProfileRequest;
use App\Models\User;
use App\Services\AccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The signed-in person's own account, for every staff role. Acts only on the person making the request. */
class AccountController extends Controller
{
    public function __construct(private readonly AccountService $account) {}

    /** The page; the same address answers JSON with what the page shows. */
    public function show(Request $request): Response|JsonResponse
    {
        if ($request->expectsJson()) {
            return response()->json($this->account->view($this->me($request), $request->session()->getId()));
        }

        return Inertia::render('account');
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->account->updateProfile(
            $this->me($request),
            $request->string('name')->toString(),
            $request->string('locale')->toString(),
        );

        return response()->json($user->asSessionUser());
    }

    public function password(ChangePasswordRequest $request): JsonResponse
    {
        $this->account->changePassword(
            $this->me($request),
            $request->string('current')->toString(),
            $request->string('password')->toString(),
            $request->session()->getId(),
        );

        return response()->json(['ok' => true]);
    }

    public function notifications(SetNotificationRequest $request): JsonResponse
    {
        $this->account->setNotification(
            $this->me($request),
            AccountNotification::from($request->string('key')->toString()),
            $request->boolean('on'),
        );

        return response()->json(['ok' => true]);
    }

    public function signOutOthers(SignOutOthersRequest $request): JsonResponse
    {
        $ended = $this->account->signOutOthers(
            $this->me($request),
            $request->string('password')->toString(),
            $request->session()->getId(),
        );

        return response()->json(['ended' => $ended]);
    }

    private function me(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
