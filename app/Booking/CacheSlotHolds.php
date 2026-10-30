<?php

namespace App\Booking;

use App\Booking\Contracts\SlotHolds;
use App\Exceptions\SlotUnavailable;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Cache\Repository as CacheRepository;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use LogicException;

/**
 * Slot holds kept in a Laravel cache store (`vocamed.holds_store`: the database store today, Redis by changing one setting).
 * A clinic's live holds are one small list, changed only while holding a lock, so two people cannot both win the same slot.
 * Expiry is a timestamp on each hold, read as of now, so it does not depend on the store's own clock.
 */
class CacheSlotHolds implements SlotHolds
{
    public function hold(Clinic $clinic, User $by, Doctor $doctor, Service $service, CarbonImmutable $startsAt): SlotHold
    {
        $now = CarbonImmutable::now();
        $blockedUntil = $startsAt->addMinutes($service->duration_minutes + $service->buffer_minutes);

        $hold = new SlotHold(
            (string) Str::ulid(),
            $clinic->id,
            $doctor->id,
            $service->id,
            $startsAt,
            $blockedUntil,
            (string) $by->id,
            $now->addSeconds((int) config('vocamed.hold_seconds')),
        );

        return $this->locked($clinic, function () use ($clinic, $hold, $by, $now): SlotHold {
            // A person holds one slot at a time: the new hold replaces the old.
            $others = array_values(array_filter(
                $this->live($clinic, $now),
                fn (SlotHold $existing) => $existing->heldBy !== (string) $by->id,
            ));

            $taken = array_flip(array_merge(...array_map(
                fn (SlotHold $existing) => $existing->doctorId === $hold->doctorId ? $existing->cells() : [],
                $others,
            ) ?: [[]]));

            foreach ($hold->cells() as $cell) {
                if (isset($taken[$cell])) {
                    throw new SlotUnavailable;
                }
            }

            $this->save($clinic, [...$others, $hold]);

            return $hold;
        });
    }

    public function release(Clinic $clinic, User $by, string $holdId): void
    {
        $this->locked($clinic, function () use ($clinic, $by, $holdId): void {
            $this->save($clinic, array_values(array_filter(
                $this->live($clinic, CarbonImmutable::now()),
                fn (SlotHold $hold) => ! ($hold->id === $holdId && $hold->heldBy === (string) $by->id),
            )));
        });
    }

    public function releaseFor(Clinic $clinic, User $by): void
    {
        $this->locked($clinic, function () use ($clinic, $by): void {
            $this->save($clinic, array_values(array_filter(
                $this->live($clinic, CarbonImmutable::now()),
                fn (SlotHold $hold) => $hold->heldBy !== (string) $by->id,
            )));
        });
    }

    public function active(Clinic $clinic): array
    {
        return $this->live($clinic, CarbonImmutable::now());
    }

    /**
     * @return list<SlotHold> the clinic's holds that have not run out
     */
    private function live(Clinic $clinic, CarbonImmutable $now): array
    {
        $stored = $this->store()->get($this->key($clinic), []);
        $holds = [];

        foreach (is_array($stored) ? $stored : [] as $data) {
            $hold = SlotHold::fromStore($data);

            if (! $hold->isExpired($now)) {
                $holds[] = $hold;
            }
        }

        return $holds;
    }

    /**
     * @param  list<SlotHold>  $holds
     */
    private function save(Clinic $clinic, array $holds): void
    {
        $this->store()->put($this->key($clinic), array_map(fn (SlotHold $hold) => $hold->toStore(), $holds), (int) config('vocamed.hold_seconds') + 60);
    }

    /**
     * Run `$work` while holding the clinic's hold lock. If the lock cannot be had in a few seconds, say the slot is unavailable.
     *
     * @template T
     *
     * @param  \Closure(): T  $work
     * @return T
     */
    private function locked(Clinic $clinic, \Closure $work): mixed
    {
        try {
            return $this->lock('slot-holds-lock:'.$clinic->id)->block(3, $work);
        } catch (LockTimeoutException) {
            throw new SlotUnavailable;
        }
    }

    /** A lock on the holds store (every store that can hold slots can lock). */
    private function lock(string $name): Lock
    {
        $store = Cache::store((string) config('vocamed.holds_store'));

        if (! $store instanceof CacheRepository || ! $store->getStore() instanceof LockProvider) {
            throw new LogicException('The slot-holds cache store must support locks.');
        }

        return $store->getStore()->lock($name, 10);
    }

    private function key(Clinic $clinic): string
    {
        return 'slot-holds:'.$clinic->id;
    }

    private function store(): Repository
    {
        return Cache::store((string) config('vocamed.holds_store'));
    }
}
