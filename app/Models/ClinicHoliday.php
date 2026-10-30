<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A day the whole clinic is closed. Written only through ClinicSettingsService.
 *
 * @property string $id
 * @property string $clinic_id
 * @property Carbon $date
 * @property string $name
 */
class ClinicHoliday extends Model
{
    use BelongsToClinic, HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
