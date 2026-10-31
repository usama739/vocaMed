<?php

namespace App\PatientLinks;

use App\Booking\BookingService;
use App\Booking\SlotService;
use App\Enums\AppointmentStatus;
use App\Exceptions\InvalidInput;
use App\Exceptions\InvalidTransition;
use App\Exceptions\LinkExpired;
use App\Exceptions\OutsideWindow;
use App\Models\PatientReply;
use App\PatientLinks\Contracts\PatientLinkDelivery;
use App\Support\ClinicClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * What a patient can do through their link: confirm, cancel, move (or ask to move) the appointment, and ask for a new link. Every
 * action runs inside the patient's clinic through the booking engine, is recorded in the history as "the patient", and leaves a
 * reply for reception's timeline. The rules are `LinkRules`'s; this only applies them.
 */
class PatientLinkActions
{
    public function __construct(
        private readonly PatientLinks $links,
        private readonly LinkRules $rules,
        private readonly BookingService $booking,
        private readonly SlotService $slots,
        private readonly RescheduleRequests $requests,
        private readonly PatientLinkDelivery $delivery,
    ) {}

    /**
     * Booked becomes confirmed; repeating it is harmless.
     *
     * @return array{status: string}
     */
    public function confirm(string $token): array
    {
        return $this->act($token, function (ResolvedLink $r): array {
            $appointment = $r->appointment;

            if ($appointment->status === AppointmentStatus::Confirmed) {
                return ['status' => $appointment->status->value];
            }

            if (! $appointment->status->isOpen()) {
                throw new InvalidTransition('This appointment cannot be confirmed.');
            }

            if ($this->rules->of($r)['started']) {
                throw new OutsideWindow('The appointment has already started.');
            }

            $saved = $this->booking->setStatus($appointment, AppointmentStatus::Confirmed);
            $this->reply($r, 'confirm');

            return ['status' => $saved->status->value];
        });
    }

    /**
     * Refused once the cancellation window has closed.
     *
     * @return array{status: string}
     */
    public function cancel(string $token): array
    {
        return $this->act($token, function (ResolvedLink $r): array {
            if (! $r->appointment->status->isOpen()) {
                throw new InvalidTransition('This appointment cannot be cancelled.');
            }

            if (! $this->rules->of($r)['allowed']['cancel']) {
                throw new OutsideWindow('It is too late to cancel online.');
            }

            $saved = $this->booking->cancel($r->appointment);
            $this->reply($r, 'cancel');

            return ['status' => $saved->status->value];
        });
    }

    /**
     * Moves the appointment at once, or (when the clinic approves changes) files a request for the doctor and keeps the original.
     * A time that was just taken answers `SLOT_UNAVAILABLE` with the nearest alternatives.
     *
     * @return array{result: string, startsAt: string}
     */
    public function reschedule(string $token, CarbonImmutable $startsAt): array
    {
        return $this->act($token, function (ResolvedLink $r) use ($startsAt): array {
            $rules = $this->rules->of($r);
            $appointment = $r->appointment;

            if (! $appointment->status->isOpen() || $rules['pendingRequest']) {
                throw new InvalidTransition('This appointment cannot be moved.');
            }

            if (! $rules['allowed']['reschedule']) {
                throw new OutsideWindow('It is too late to change online.');
            }

            $clock = ClinicClock::for($r->clinic);
            $today = CarbonImmutable::parse($clock->today());
            $day = $clock->dateOf($startsAt);

            if ($day < $today->format('Y-m-d') || $day > $today->addDays(LinkViews::HORIZON_DAYS - 1)->format('Y-m-d')) {
                throw new InvalidInput('Choose a time in the next 14 days.', 'startsAt');
            }

            if ($startsAt->equalTo($appointment->starts_at)) {
                throw new InvalidInput('Choose a different time.', 'startsAt');
            }

            // Throws SLOT_UNAVAILABLE with the nearest alternatives when it cannot be booked (the appointment's own time is not in the way).
            $this->slots->assertBookable($r->clinic, $r->doctor, $r->service, $startsAt, $appointment->id, null);

            $iso = $startsAt->utc()->format('Y-m-d\TH:i:s.v\Z');

            if ($r->settings->rescheduleRequiresApproval) {
                $this->requests->create($appointment, $startsAt);
                $this->reply($r, 'reschedule');

                return ['result' => 'requested', 'startsAt' => $iso];
            }

            $this->booking->reschedule($r->clinic, null, $appointment, $startsAt);
            $this->reply($r, 'reschedule');

            return ['result' => 'moved', 'startsAt' => $iso];
        });
    }

    /**
     * "Send me a new link". The answer is the same for a link that is known, expired or unknown, so nobody can probe for bookings.
     * A link is only really sent for an appointment that has not long passed.
     */
    public function requestNewLink(string $token): void
    {
        $link = $this->links->open($token);

        if ($link === null || $link->appointment->ends_at->toImmutable()->addHours(PatientLinks::GRACE_HOURS)->isPast()) {
            return;
        }

        $this->links->within($link, function () use ($link): void {
            $this->delivery->deliver($link->appointment, $this->links->urlFor($this->links->issue($link->appointment)));
        });
    }

    /**
     * @template T
     *
     * @param  callable(ResolvedLink): T  $action
     * @return T
     */
    private function act(string $token, callable $action): mixed
    {
        $link = $this->links->open($token);

        if ($link === null || ! $link->usable) {
            throw new LinkExpired;
        }

        return $this->links->within($link, fn () => DB::transaction(fn () => $action($link)));
    }

    private function reply(ResolvedLink $r, string $action): void
    {
        (new PatientReply)->forceFill([
            'appointment_id' => $r->appointment->id,
            'patient_id' => $r->patient->id,
            'action' => $action,
            'created_at' => now(),
        ])->save();
    }
}
