<?php

namespace App\Live;

use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The one place a change is announced. Nothing is sent where broadcasting is switched off (`BROADCAST_CONNECTION=null`).
 *
 * The announcement waits for the surrounding transaction to commit (a rolled-back change announces nothing) and can never
 * break the change it follows: if the socket server cannot be reached, even with the queue set to `sync`, the failure is
 * reported and the request carries on, and the screens' slow refresh catches up.
 */
final class LiveUpdates
{
    public static function announce(?string $clinicId, LiveTopic $topic, ?string $doctorId = null, ?string $id = null): void
    {
        if ($clinicId === null || config('broadcasting.default') === 'null') {
            return;
        }

        DB::afterCommit(function () use ($clinicId, $topic, $doctorId, $id): void {
            try {
                event(new LiveUpdate($clinicId, $topic->value, $doctorId, $id));
            } catch (Throwable $e) {
                report($e);
            }
        });
    }
}
