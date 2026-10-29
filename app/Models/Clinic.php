<?php

namespace App\Models;

use App\Enums\ClinicStatus;
use Database\Factories\ClinicFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * The tenant. Every clinic table carries its id, and this is the one table that does not.
 *
 * @property string $id
 * @property string $name
 * @property string $slug
 * @property string $country
 * @property string $timezone
 * @property string $default_locale
 * @property array<string, mixed>|null $settings
 * @property ClinicStatus $status
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['name', 'slug', 'country', 'timezone', 'default_locale', 'settings'])]
class Clinic extends Model
{
    /** @use HasFactory<ClinicFactory> */
    use HasFactory, HasUlids;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'status' => ClinicStatus::class,
        ];
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === ClinicStatus::Active;
    }
}
