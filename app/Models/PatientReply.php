<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * What a patient did through their link (confirm, cancel or ask to reschedule), for the appointment's timeline. Written only by
 * PatientLinkActions.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $appointment_id
 * @property string $patient_id
 * @property string $action
 * @property Carbon $created_at
 */
class PatientReply extends Model
{
    use BelongsToClinic, HasUlids;

    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
