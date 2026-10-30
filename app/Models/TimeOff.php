<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Leave: a doctor is away from the first to the last day, inclusive (clinic-local dates).
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $doctor_id
 * @property Carbon $start_date
 * @property Carbon $end_date
 * @property string $reason
 */
class TimeOff extends Model
{
    use BelongsToClinic, HasUlids;

    protected $table = 'time_offs';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d'];
    }
}
