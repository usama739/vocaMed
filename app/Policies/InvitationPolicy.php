<?php

namespace App\Policies;

use App\Authorization\Ability;
use App\Authorization\Permissions;
use App\Models\Invitation;
use App\Models\User;

/** Staff invitations are for the clinic admin. The clinic itself is already enforced by the tenant scope. */
class InvitationPolicy
{
    public function viewAny(User $user): bool
    {
        return Permissions::allows($user, Ability::ManageStaff);
    }

    public function view(User $user, Invitation $invitation): bool
    {
        return $this->viewAny($user) && $user->clinic_id === $invitation->clinic_id;
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, Ability::ManageStaff);
    }

    public function delete(User $user, Invitation $invitation): bool
    {
        return $this->view($user, $invitation);
    }
}
