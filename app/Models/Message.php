<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One message to a patient (confirmation, reminder, reschedule or cancellation) and what became of it. Written only by Messenger.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $appointment_id
 * @property string $patient_id
 * @property string $kind
 * @property string $channel sms, whatsapp or email
 * @property string $status queued, sent, delivered or failed
 * @property string|null $failure_reason no_consent, unreachable or not_on_whatsapp
 * @property string $dedupe_key
 * @property Carbon|null $sent_at
 * @property Carbon|null $resent_at
 * @property Carbon|null $created_at
 * @property-read Appointment $appointment
 * @property-read Patient $patient
 */
class Message extends Model
{
    use BelongsToClinic, HasUlids;

    /**
     * @return BelongsTo<Appointment, $this>
     */
    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    /**
     * @return BelongsTo<Patient, $this>
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['sent_at' => 'datetime', 'resent_at' => 'datetime'];
    }
}
