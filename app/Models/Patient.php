<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Database\Factories\PatientFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A person the clinic books. Written only by PatientDirectory. `notes` are encrypted at rest (non-clinical notes only).
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $name
 * @property string|null $phone international form, or null for a walk-in added without a number
 * @property string $preferred_locale
 * @property string $preferred_channel
 * @property Carbon|null $consent_at
 * @property string|null $notes
 * @property Carbon|null $created_at
 * @property int|null $no_show_count how many appointments were no-shows (present when loaded with withCount)
 */
class Patient extends Model
{
    /** @use HasFactory<PatientFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * @return HasMany<Appointment, $this>
     */
    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['consent_at' => 'datetime', 'notes' => 'encrypted'];
    }
}
