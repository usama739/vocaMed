<?php

namespace App\Models;

use App\Live\LiveTopic;
use App\Models\Concerns\AnnouncesLiveUpdates;
use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * A half hour a doctor keeps closed every week on that weekday.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $doctor_id
 * @property int $weekday
 * @property string $time
 */
class BlockedSlot extends Model
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
