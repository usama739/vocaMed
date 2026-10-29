<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * A person's signed-in sessions, kept in the `sessions` table (the database session driver). Lets the Account page count
 * and end the other sessions, and password changes end all of them. With another session driver there is nothing to list.
 */
class UserSessions
{
    public function supported(): bool
    {
        return config('session.driver') === 'database';
    }

    /** How many sessions the person has besides the one making this request. */
    public function countOthers(User $user, string $currentId): int
    {
        return $this->supported() ? $this->others($user, $currentId)->count() : 0;
    }

    /** End the person's other sessions. Returns how many ended. */
    public function endOthers(User $user, string $currentId): int
    {
        return $this->supported() ? $this->others($user, $currentId)->delete() : 0;
    }

    /** End every session the person has. */
    public function endAll(User $user): void
    {
        if ($this->supported()) {
            $this->table()->where('user_id', $user->id)->delete();
        }
    }

    private function others(User $user, string $currentId): Builder
    {
        return $this->table()->where('user_id', $user->id)->where('id', '!=', $currentId);
    }

    private function table(): Builder
    {
        return DB::table((string) config('session.table', 'sessions'));
    }
}
