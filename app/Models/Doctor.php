<?php

namespace App\Models;

use App\Authorization\OwnedByStaff;
use App\Models\Concerns\BelongsToClinic;
use Database\Factories\DoctorFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A doctor who can be booked. Belongs to the signed-in person who is that doctor once `user_id` is set, which is what
 * "own only" means for a doctor in the permission table.
 *
 * @property string $id
 * @property string $clinic_id
 * @property int|null $user_id
 * @property string $display_name
 * @property string $specialty
 * @property list<string> $languages
 * @property bool $is_active
 * @property-read User|null $user
 */
class Doctor extends Model implements OwnedByStaff
{
    /** @use HasFactory<DoctorFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['languages' => 'array', 'is_active' => 'boolean'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsToMany<Service, $this>
     */
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'doctor_service');
    }

    public function isOwnedBy(User $user): bool
    {
        return $this->user_id !== null && $this->user_id === $user->id;
    }
}
