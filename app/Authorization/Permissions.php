<?php

namespace App\Authorization;

use App\Models\User;

/**
 * The one place that answers "may this person do this?". Gates and policies both end here.
 *
 * Fail-closed: a deactivated person or one with no role may do nothing, and an ability a role has only on its own
 * records is refused unless the record is passed and is theirs. Checking an "own only" ability without a record
 * therefore says no; use `access()` when a screen only needs to know whether to show something.
 */
final class Permissions
{
    public static function allows(User $user, Ability $ability, ?OwnedByStaff $subject = null): bool
    {
        return match (self::access($user, $ability)) {
            Access::All => true,
            Access::Own => $subject?->isOwnedBy($user) === true,
            Access::None => false,
        };
    }

    public static function access(User $user, Ability $ability): Access
    {
        if (! $user->is_active || $user->role === null) {
            return Access::None;
        }

        return $ability->access($user->role);
    }
}
