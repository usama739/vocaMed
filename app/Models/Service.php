<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Database\Factories\ServiceFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * What can be booked. Written only by the service catalogue, which sets every field explicitly.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $name
 * @property int $duration_minutes
 * @property int $buffer_minutes
 * @property bool $is_active
 */
class Service extends Model
{
    /** @use HasFactory<ServiceFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['duration_minutes' => 'integer', 'buffer_minutes' => 'integer', 'is_active' => 'boolean'];
    }

    /**
     * @return BelongsToMany<Doctor, $this>
     */
    public function doctors(): BelongsToMany
    {
        return $this->belongsToMany(Doctor::class, 'doctor_service');
    }
}
