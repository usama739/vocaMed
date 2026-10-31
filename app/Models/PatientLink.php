<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A private link to one appointment. Only the hash of the token is stored; the token is shown once. Written only by PatientLinks.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $appointment_id
 * @property string $token_hash
 * @property Carbon|null $revoked_at
 * @property-read Appointment $appointment
 */
class PatientLink extends Model
{
    use BelongsToClinic, HasUlids;

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * @return BelongsTo<Appointment, $this>
     */
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['revoked_at' => 'datetime'];
    }
}
