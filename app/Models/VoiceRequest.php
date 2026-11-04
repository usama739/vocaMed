<?php

namespace App\Models;

use App\Enums\VoiceSource;
use App\Enums\VoiceStatus;
use App\Models\Concerns\BelongsToClinic;
use Database\Factories\VoiceRequestFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One spoken or typed booking request on its way to a draft. Written by the voice endpoints and the voice jobs; only the person
 * who made it may read it back.
 *
 * @property string $id
 * @property string $clinic_id
 * @property int $user_id
 * @property VoiceSource $source
 * @property VoiceStatus $status
 * @property string|null $audio_path an encrypted file on private disk; null once deleted
 * @property string|null $audio_mime
 * @property int|null $duration_seconds what the browser said it recorded, rounded up
 * @property string|null $transcript what was heard (or typed); encrypted at rest
 * @property array{fields: array<string, mixed>, draft: array<string, mixed>|null}|null $parsed_json encrypted at rest
 * @property string|null $failure_code
 * @property Carbon|null $purged_at when the recording was deleted
 * @property Carbon|null $created_at
 * @property-read User $user
 */
class VoiceRequest extends Model
{
    /** @use HasFactory<VoiceRequestFactory> */
    use BelongsToClinic, HasFactory, HasUlids;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Stops the request with a reason the screen can show ("no_speech", "rate_limited", ...). */
    public function markFailed(string $code): void
    {
        $this->forceFill(['status' => VoiceStatus::Failed, 'failure_code' => $code])->save();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'source' => VoiceSource::class,
            'status' => VoiceStatus::class,
            'transcript' => 'encrypted',
            'parsed_json' => 'encrypted:array',
            'purged_at' => 'datetime',
        ];
    }
}
