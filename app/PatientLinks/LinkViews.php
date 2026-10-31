<?php

namespace App\PatientLinks;

use App\Booking\SlotService;
use App\Enums\AppointmentStatus;
use App\Models\Appointment;
use App\Models\ClinicHoliday;
use App\Support\ClinicClock;
use App\Views\Reception\DoctorAvailabilityView;
use Carbon\CarbonImmutable;

/**
 * The read models of the four patient pages (`ManagePage`, `ReschedulePage`, `StatusPage`, `ExpiredLinkView`). A link opens one
 * appointment, so a page carries only that appointment's details: the patient's first name, never their full name or phone, and
 * nothing about anyone else. A token that opens nothing, or no longer works, answers `expired`, never a 404.
 */
class LinkViews
{
    /** The reschedule page offers today and the thirteen days after it. */
    public const HORIZON_DAYS = 14;

    public function __construct(
        private readonly PatientLinks $links,
        private readonly LinkRules $rules,
        private readonly SlotService $slots,
        private readonly DoctorAvailabilityView $hours,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function manage(string $token): array
    {
        return $this->page($token, function (ResolvedLink $r): array {
            $rules = $this->rules->of($r);
            $base = $this->base($r);
            $appointment = $r->appointment;

            return [
                ...$base,
                'allowed' => $rules['allowed'],
                'late' => $rules['late'],
                'cancellationWindowHours' => $rules['windowHours'],
                'pendingRequest' => $rules['pendingRequest'],
                'queueOpen' => ClinicClock::for($r->clinic)->dateOf($appointment->starts_at) === $base['today']
                    && ! in_array($appointment->status, [AppointmentStatus::Cancelled, AppointmentStatus::NoShow], true),
            ];
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function reschedule(string $token): array
    {
        return $this->page($token, function (ResolvedLink $r): array {
            $rules = $this->rules->of($r);
            $base = $this->base($r);

            return [
                ...$base,
                'allowed' => $rules['allowed'],
                'late' => $rules['late'],
                'pendingRequest' => $rules['pendingRequest'],
                'needsApproval' => $r->settings->rescheduleRequiresApproval,
                'days' => $rules['allowed']['reschedule'] ? $this->days($r, $base['today']) : [],
            ];
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function status(string $token): array
    {
        return $this->page($token, function (ResolvedLink $r): array {
            $base = $this->base($r);
            $appointment = $r->appointment;
            $clock = ClinicClock::for($r->clinic);
            $stage = fn (string $stage, int $ahead = 0, int $waitMin = 0): array => [
                ...$base,
                'stage' => $stage,
                'ahead' => $ahead,
                'waitMin' => $waitMin,
                'updatedAt' => $this->iso(CarbonImmutable::now()),
            ];

            if ($clock->dateOf($appointment->starts_at) !== $base['today']) {
                return $stage('notToday');
            }

            switch ($appointment->status) {
                case AppointmentStatus::Cancelled:
                case AppointmentStatus::NoShow:
                    return $stage('ended');
                case AppointmentStatus::Booked:
                case AppointmentStatus::Confirmed:
                    return $stage('notYet');
                case AppointmentStatus::InConsultation:
                    return $stage('consult');
                case AppointmentStatus::Done:
                    return $stage('done');
                case AppointmentStatus::Arrived:
                    break;
            }

            // Checked in: the queue is the doctor's patients that day who are in the consulting room or checked in earlier.
            $ahead = Appointment::query()->with('service')
                ->where('doctor_id', $appointment->doctor_id)->whereKeyNot($appointment->id)
                ->where('starts_at', '>=', $clock->startOfDay($base['today']))->where('starts_at', '<', $clock->endOfDay($base['today']))
                ->where(fn ($q) => $q->where('status', 'in_consultation')
                    ->orWhere(fn ($q2) => $q2->where('status', 'arrived')->where('starts_at', '<', $appointment->starts_at)))
                ->get();
            $minutes = $ahead->sum(fn (Appointment $a) => $a->service->duration_minutes);

            return $stage($ahead->isEmpty() ? 'next' : 'waiting', $ahead->count(), (int) (ceil($minutes / 5) * 5));
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function expired(string $token): array
    {
        return $this->page($token, fn (ResolvedLink $r): array => $this->expiredFor($r));
    }

    /**
     * Opens the link and builds the page inside its clinic; a link that opens nothing or no longer works is the expired page.
     *
     * @param  callable(ResolvedLink): array<string, mixed>  $build
     * @return array<string, mixed>
     */
    private function page(string $token, callable $build): array
    {
        $link = $this->links->open($token);

        if ($link === null) {
            return ['state' => 'expired', 'clinic' => null];
        }

        if (! $link->usable) {
            return $this->expiredFor($link);
        }

        return $this->links->within($link, fn () => $build($link));
    }

    /**
     * @return array<string, mixed>
     */
    private function expiredFor(ResolvedLink $link): array
    {
        return ['state' => 'expired', 'clinic' => ['name' => $link->clinic->name, 'phone' => $link->clinic->phone ?? '']];
    }

    /**
     * @return array{state: string, clinic: array<string, string>, today: string, appointment: array<string, mixed>, preferredLocale: string}
     */
    private function base(ResolvedLink $r): array
    {
        $appointment = $r->appointment;
        $first = preg_split('/\s+/', trim($r->patient->name));

        return [
            'state' => 'valid',
            'clinic' => [
                'name' => $r->clinic->name,
                'phone' => $r->clinic->phone ?? '',
                'address' => $r->clinic->address ?? '',
                'timezone' => $r->clinic->timezone,
            ],
            'today' => ClinicClock::for($r->clinic)->today(),
            'appointment' => [
                'firstName' => $first === false ? '' : $first[0],
                'doctorName' => $r->doctor->display_name,
                'serviceName' => $r->service->name,
                'durationMin' => $r->service->duration_minutes,
                'startsAt' => $this->iso($appointment->starts_at->toImmutable()),
                'status' => $appointment->status->value,
            ],
            'preferredLocale' => $r->patient->preferred_locale,
        ];
    }

    /**
     * Today and the next thirteen days: each day closed (the doctor does not work) or with its free, future times in order.
     * The appointment's own time is not offered, and nothing a receptionist is holding.
     *
     * @return list<array{date: string, closed: bool, slots: list<string>}>
     */
    private function days(ResolvedLink $r, string $today): array
    {
        $hours = $this->hours->of($r->doctor);
        $first = CarbonImmutable::parse($today);
        $holidays = [];

        foreach (ClinicHoliday::query()->whereBetween('date', [$today, $first->addDays(self::HORIZON_DAYS - 1)->format('Y-m-d')])->get() as $holiday) {
            $holidays[$holiday->date->format('Y-m-d')] = true;
        }

        $now = CarbonImmutable::now();
        $current = $r->appointment->starts_at->toImmutable();
        $days = [];

        for ($i = 0; $i < self::HORIZON_DAYS; $i++) {
            $day = $first->addDays($i);
            $date = $day->format('Y-m-d');
            $working = collect($hours['windows'])->contains('weekday', $day->dayOfWeek)
                && ! isset($holidays[$date])
                && ! collect($hours['timeOff'])->contains(fn (array $leave) => $leave['startDate'] <= $date && $date <= $leave['endDate']);

            $times = [];

            if ($working) {
                foreach ($this->slots->slots($r->clinic, $r->doctor, $r->service, $date, $r->appointment->id, null) as $slot) {
                    if (! $slot->held && $slot->startsAt->greaterThan($now) && ! $slot->startsAt->equalTo($current)) {
                        $times[] = $this->iso($slot->startsAt);
                    }
                }
            }

            $days[] = ['date' => $date, 'closed' => ! $working, 'slots' => $times];
        }

        return $days;
    }

    private function iso(CarbonImmutable $at): string
    {
        return $at->utc()->format('Y-m-d\TH:i:s.v\Z');
    }
}
