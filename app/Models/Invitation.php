<?php

namespace App\Models;

use App\Enums\InvitationState;
use App\Enums\Role;
use App\Models\Concerns\BelongsToClinic;
use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An invitation to join a clinic's staff. Created only by the invitation service, which sets the clinic,
 * role and token hash explicitly; nothing here is mass-assignable.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $email
 * @property Role $role
 * @property string $token_hash
 * @property Carbon $expires_at
 * @property Carbon|null $accepted_at
 * @property Carbon|null $revoked_at
 * @property string|null $doctor_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Clinic $clinic
 */
class Invitation extends Model
{
    /** @use HasFactory<InvitationFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => Role::class,
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Doctor, $this>
     */
    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function state(): InvitationState
    {
        return match (true) {
            $this->accepted_at !== null => InvitationState::Used,
            $this->revoked_at !== null => InvitationState::Expired,
            $this->expires_at->isPast() => InvitationState::Expired,
            default => InvitationState::Valid,
        };
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
