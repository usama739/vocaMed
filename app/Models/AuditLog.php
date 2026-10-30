<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * One line of the clinic's history: who did what, when. Append-only: it can be created and read, never changed or
 * removed. Written by the Audit service, in the same transaction as the change it records.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $actor_type user, patient or system
 * @property string|null $actor_id
 * @property string $action
 * @property string|null $subject_type
 * @property string|null $subject_id
 * @property array<string, mixed>|null $meta
 * @property Carbon $created_at
 */
class AuditLog extends Model
{
    use BelongsToClinic, HasUlids;

    public const UPDATED_AT = null;

    public $timestamps = true;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('The audit log is append-only: entries cannot be changed.'));
        static::deleting(fn () => throw new LogicException('The audit log is append-only: entries cannot be deleted.'));
    }
}
