<?php

namespace App\Services;

use App\Enums\AccountNotification;
use App\Exceptions\InvalidPassword;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/** What a signed-in person can change about their own account. Never touches anyone else's. */
class AccountService
{
    public function __construct(private readonly UserSessions $sessions) {}

    /**
     * The Account page: the person, their email choices and how many other sessions are open.
     *
     * @return array{user: array<string, string>, notifications: array<string, bool>, otherSessions: int}
     */
    public function view(User $user, string $sessionId): array
    {
        return [
            'user' => $user->asSessionUser(),
            'notifications' => $user->notificationChoices(),
            'otherSessions' => $this->sessions->countOthers($user, $sessionId),
        ];
    }

    public function updateProfile(User $user, string $name, string $locale): User
    {
        $user->forceFill(['name' => $name, 'locale' => $locale])->save();

        return $user;
    }

    /**
     * Change the password after confirming the current one. Everywhere else is signed out (the remember-me cookies stop
     * working and the other sessions end); this session stays.
     */
    public function changePassword(User $user, string $current, string $new, string $sessionId): void
    {
        $this->confirmPassword($user, $current);

        $user->forceFill(['password' => $new, 'remember_token' => Str::random(60)])->save();
        $this->sessions->endOthers($user, $sessionId);
    }

    public function setNotification(User $user, AccountNotification $key, bool $on): void
    {
        $user->forceFill([
            'notification_preferences' => [...($user->notification_preferences ?? []), $key->value => $on],
        ])->save();
    }

    /** End every other session after confirming the password. Returns how many ended. */
    public function signOutOthers(User $user, string $password, string $sessionId): int
    {
        $this->confirmPassword($user, $password);

        return $this->sessions->endOthers($user, $sessionId);
    }

    private function confirmPassword(User $user, string $password): void
    {
        if (! Hash::check($password, $user->password)) {
            throw new InvalidPassword;
        }
    }
}
