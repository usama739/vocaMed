<?php

namespace App\PatientLinks;

use Carbon\CarbonImmutable;

/**
 * What a patient may do with their appointment, decided once for every page and action (the pages only read it). Changing is free
 * until `cancellationWindowHours` before the visit (no limit when that is empty, so until the start), and never after the start.
 */
class LinkRules
{
    public function __construct(private readonly RescheduleRequests $requests) {}

    /**
     * @return array{allowed: array{confirm: bool, reschedule: bool, cancel: bool}, late: array{deadline: string}|null, pendingRequest: bool, windowHours: int|null, started: bool}
     */
    public function of(ResolvedLink $link): array
    {
        $appointment = $link->appointment;
        $now = CarbonImmutable::now();
        $start = $appointment->starts_at->toImmutable();
        $started = $now->greaterThanOrEqualTo($start);
        $windowHours = $link->settings->cancellationWindowHours;
        $deadline = $windowHours === null ? $start : $start->subHours($windowHours);
        $open = $appointment->status->isOpen();
        $late = $open && ($started || $now->greaterThan($deadline));
        $pending = $this->requests->hasPending($appointment);

        return [
            'allowed' => [
                'confirm' => $appointment->status->value === 'booked' && ! $started,
                'reschedule' => $open && ! $late && ! $pending,
                'cancel' => $open && ! $late,
            ],
            'late' => $late ? ['deadline' => $deadline->utc()->format('Y-m-d\TH:i:s.v\Z')] : null,
            'pendingRequest' => $pending,
            'windowHours' => $windowHours,
            'started' => $started,
        ];
    }
}
