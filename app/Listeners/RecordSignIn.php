<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\Audit;
use App\Support\TenantContext;
use Illuminate\Auth\Events\Login;

/** Writes `auth.login` to the clinic's audit log when someone signs in (not when a remember-me cookie is recalled). */
class RecordSignIn
{
    public function __construct(private readonly Audit $audit, private readonly TenantContext $tenant) {}

    public function handle(Login $event): void
    {
        $user = $event->user;

        if (! $user instanceof User || $user->clinic === null || ! request()->routeIs('login.store')) {
            return;
        }

        $this->tenant->run($user->clinic, fn () => $this->audit->record('auth.login', $user, [], $user));
    }
}
