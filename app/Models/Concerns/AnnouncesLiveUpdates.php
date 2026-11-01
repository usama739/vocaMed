<?php

namespace App\Models\Concerns;

use App\Live\LiveTopic;
use App\Live\LiveUpdates;
use Illuminate\Database\Eloquent\Model;

/**
 * Saving or deleting a row tells the clinic's open screens to read again (see `LiveUpdate`). The model names its topic
 * with `liveTopic()`. Changes made without the model (a bulk query) announce themselves with `LiveUpdates::announce()`.
 *
 * @mixin Model
 */
trait AnnouncesLiveUpdates
{
    abstract protected function liveTopic(): LiveTopic;

    public static function bootAnnouncesLiveUpdates(): void
    {
        static::saved(fn (self $model) => $model->announceLiveUpdate());
        static::deleted(fn (self $model) => $model->announceLiveUpdate());
    }

    protected function announceLiveUpdate(): void
    {
        LiveUpdates::announce($this->liveClinicId(), $this->liveTopic(), $this->liveDoctorId(), (string) $this->getKey());
    }

    protected function liveClinicId(): ?string
    {
        $id = $this->getAttribute('clinic_id');

        return $id === null ? null : (string) $id;
    }

    /** The doctor the change belongs to, so that doctor's own screens hear of it. */
    protected function liveDoctorId(): ?string
    {
        $id = $this->getAttribute('doctor_id');

        return $id === null ? null : (string) $id;
    }
}
