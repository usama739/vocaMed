<?php

namespace App\Models;

use App\Live\LiveTopic;
use App\Models\Concerns\AnnouncesLiveUpdates;
use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * One working interval of a doctor on a weekday (0 = Sunday). Written only by AvailabilityService.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $doctor_id
 * @property int $weekday
 * @property string $start_time
 * @property string $end_time
 */
class ScheduleRule extends Model
{
    use AnnouncesLiveUpdates, BelongsToClinic, HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['weekday' => 'integer'];
    }

    protected function liveTopic(): LiveTopic
    {
        return LiveTopic::Directory;
    }
}
