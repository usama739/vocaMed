<?php

namespace App\Models;

use App\Authorization\OwnedByStaff;
use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A patient's request to move an appointment, waiting for (or decided by) the doctor. It is "owned" by the doctor it is for, which
 * is what "own requests only" means for a doctor in the permission table. Written only by RescheduleRequests.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $appointment_id
 * @property string $patient_id
 * @property string $doctor_id
 * @property Carbon $from_starts_at the appointment's time when the patient asked
 * @property Carbon $proposed_starts_at
 * @property string $status pending, approved or rejected
 * @property string|null $message the doctor's optional message to reception
 * @property Carbon|null $decided_at
 * @property string|null $decided_by
 * @property Carbon|null $created_at
 * @property-read Appointment $appointment
 */
class RescheduleRequest extends Model implements OwnedByStaff
{
    use BelongsToClinic, HasUlids;

    /**
     * @return BelongsTo<Appointment, $this>
     */
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function isOwnedBy(User $user): bool
    {
        return Doctor::query()->whereKey($this->doctor_id)->where('user_id', $user->id)->exists();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['from_starts_at' => 'datetime', 'proposed_starts_at' => 'datetime', 'decided_at' => 'datetime'];
    }
}
