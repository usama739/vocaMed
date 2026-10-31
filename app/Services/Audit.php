<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\ActingAs;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Writes the clinic's history. Call it from the service that makes the change, inside that service's transaction, so a
 * change never exists without its entry and an entry never records a change that rolled back. Acts for the clinic being
 * acted for (the tenant context) and, by default, the signed-in person.
 */
class Audit
{
    public function __construct(private readonly ActingAs $acting) {}

    /**
     * @param  array<string, mixed>  $meta  names and small facts only: never passwords, notes or other sensitive values
     */
    public function record(string $action, ?Model $subject = null, array $meta = [], ?User $actor = null): AuditLog
    {
        $actor ??= Auth::user();
        // Nobody signed in, but a patient acting through their link: the history says so.
        $patient = $actor === null && $this->acting->isPatient();

        $entry = new AuditLog;
        $entry->forceFill([
            'actor_type' => $patient ? 'patient' : ($actor === null ? 'system' : 'user'),
            'actor_id' => $actor === null ? null : (string) $actor->id,
            'action' => $action,
            'subject_type' => $subject === null ? null : class_basename($subject),
            'subject_id' => $subject?->getKey() === null ? null : (string) $subject->getKey(),
            'meta' => $meta === [] ? null : $meta,
        ])->save();

        return $entry;
    }
}
