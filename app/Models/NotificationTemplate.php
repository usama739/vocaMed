<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/**
 * A message the clinic has edited, for one kind, channel and language. Messages it has not edited are not stored.
 *
 * @property string $id
 * @property string $clinic_id
 * @property string $kind
 * @property string $channel
 * @property string $locale
 * @property string $body
 */
class NotificationTemplate extends Model
{
    use BelongsToClinic, HasUlids;
}
