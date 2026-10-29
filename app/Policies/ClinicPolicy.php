<?php

namespace App\Policies;

use App\Authorization\Ability;
use App\Authorization\Permissions;
use App\Models\Clinic;
use App\Models\User;

/** Anyone on a clinic's staff can see it; only the clinic admin can change its setup. Never another clinic's. */
class ClinicPolicy
{
    public function view(User $user, Clinic $clinic): bool
    {
        return $user->is_active && $user->clinic_id === $clinic->id;
    }

    public function update(User $user, Clinic $clinic): bool
    {
        return $this->view($user, $clinic) && Permissions::allows($user, Ability::ManageClinicSetup);
    }
}
