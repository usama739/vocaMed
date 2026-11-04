<?php

namespace App\Voice;

use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

/**
 * Keeps recordings inside what the speech provider's free tier allows (audio seconds an hour and a day, requests a day), a little under its
 * own limits, so a busy hour is answered with "try again" here (429, with the wait) instead of with an error from the provider. A
 * recording shorter than the provider's minimum is counted as that long, the way the provider bills it. Nothing is given back when a
 * request later fails: it was still sent. A limit of 0 means no limit.
 *
 * The counts live in the cache store, so they are shared by every process that serves the clinics.
 */
class SpeechBudget
{
    /** @throws TooManyRequestsHttpException when this recording would go over a limit */
    public function reserve(float $seconds): void
    {
        $billed = max((int) config('vocamed.voice.budget.billed_minimum_seconds', 10), (int) ceil($seconds));
        $now = now();

        $buckets = [
            ['hour', 3600, (int) config('vocamed.voice.budget.audio_seconds_hour'), $billed, $now->format('YmdH'), $now->addHour()->startOfHour()],
            ['day', 86400, (int) config('vocamed.voice.budget.audio_seconds_day'), $billed, $now->format('Ymd'), $now->addDay()->startOfDay()],
            ['requests', 86400, (int) config('vocamed.voice.budget.requests_day'), 1, $now->format('Ymd'), $now->addDay()->startOfDay()],
        ];

        $taken = [];

        foreach ($buckets as [$name, $ttl, $limit, $amount, $window, $resets]) {
            if ($limit <= 0) {
                continue;
            }

            $key = "voice:speech-budget:$name:$window";
            Cache::add($key, 0, $ttl);

            if ((int) Cache::increment($key, $amount) > $limit) {
                Cache::decrement($key, $amount);

                foreach ($taken as [$takenKey, $takenAmount]) {
                    Cache::decrement($takenKey, $takenAmount);
                }

                throw new TooManyRequestsHttpException(max(1, (int) $now->diffInSeconds($resets, false)), 'The speech service is busy; try again later.');
            }

            $taken[] = [$key, $amount];
        }
    }
}
