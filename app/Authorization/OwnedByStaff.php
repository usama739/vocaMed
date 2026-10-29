<?php

namespace App\Authorization;

use App\Models\User;

/**
 * A record that belongs to one staff member, such as an appointment of a doctor. It is what "own only" in the
 * permission table is checked against; the model decides whose it is (a doctor's appointments, a doctor's time off).
 */
interface OwnedByStaff
{
    public function isOwnedBy(User $user): bool;
}
