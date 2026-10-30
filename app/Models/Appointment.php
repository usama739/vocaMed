<?php

namespace App\Models;

use App\Authorization\OwnedByStaff;
use App\Enums\AppointmentStatus;
use App\Enums\BookingSource;
use App\Models\Concerns\BelongsToClinic;
use Database\Factories\AppointmentFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A booking: one patient with one doctor for one service. Written only by BookingService. It is "owned" by the doctor it is
 * with, which is what "own appointments only" means for a doctor in the permission table.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $doctor_id
 * @property string $patient_id
 * @property string $service_id
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 * @property AppointmentStatus $status
 * @property BookingSource $source
 * @property string|null $reason
 * @property string|null $notes
 * @property string|null $created_by a staff user id, or "patient" for a booking made from a patient link
 * @property Carbon|null $created_at
 * @property-read Doctor $doctor
 * @property-read Patient $patient
 * @property-read Service $service
 */
class Appointment extends Model implements OwnedByStaff
{
    /** @use HasFactory<AppointmentFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * @return array<string, mixed>
     */
    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'status' => AppointmentStatus::class,
            'source' => BookingSource::class,
            'reason' => 'encrypted',
            'notes' => 'encrypted',
        ];
    }

    /**
     * @return BelongsTo<Doctor, $this>
     */
    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    /**
     * @return BelongsTo<Patient, $this>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * @return BelongsTo<Service, $this>
     */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function isOwnedBy(User $user): bool
    {
        return Doctor::query()->whereKey($this->doctor_id)->where('user_id', $user->id)->exists();
    }
}
