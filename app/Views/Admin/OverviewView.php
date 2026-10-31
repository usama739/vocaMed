<?php

namespace App\Views\Admin;

use App\Booking\SlotService;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Message;
use App\Models\Patient;
use App\Models\Service;
use App\Scheduling\SlotRules;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\Reception\DoctorAvailabilityView;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * `AdminOverviewView` (D1): how the clinic is doing over a period, next to the period before it, and what its doctors are doing
 * today. The counts come from grouped queries (one per period, so the work stays the same however many appointments there are);
 * only the per-day histogram is bucketed by clinic-local day here, from one row per distinct start time.
 *
 * What the numbers mean, the same everywhere on the page:
 * - booked: every appointment whose visit falls in the period, whatever became of it.
 * - cancellation and no-show rates: the share of booked. Done and the other outcomes add up to booked.
 * - upcoming: still open (booked, confirmed, arrived or in consultation).
 * - confirmed: of the appointments that were not cancelled and were not walk-ins, the share the patient or the desk confirmed.
 * - reminder delivery: of the reminders that were tried (not those a patient had not consented to), the share that went out.
 * - doctor time used: the minutes of the services booked (not cancelled) against the minutes active doctors work, from their
 *   weekly hours inside the clinic's business hours, less leave, closed half hours and clinic holidays.
 *
 * @phpstan-type Tally array{booked: int, done: int, cancelled: int, noShow: int, open: int, voice: int, kept: int, byService: array<string, int>, byDoctor: array<string, array{count: int, minutes: int}>, perDay: array<string, int>}
 */
final class OverviewView
{
    public const PERIODS = ['last7', 'month', 'last3months'];

    private const OPEN = ['booked', 'confirmed', 'arrived', 'in_consultation'];

    public function __construct(private readonly SlotService $slots, private readonly DoctorAvailabilityView $hours) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, string $period): array
    {
        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $range = $this->ranges($period, $today);

        $services = Service::query()->get()->sortBy('name')->values();
        $durations = $services->pluck('duration_minutes', 'id')->all();
        $doctors = Doctor::query()->with('services')->where('is_active', true)->orderBy('display_name')->get();
        $hours = $this->hours->forDoctors($doctors);

        $now = $this->tally($clock, $range['from'], $range['to'], $durations);
        $before = $this->tally($clock, $range['previousFrom'], $range['previousTo'], $durations);

        $capacity = $this->capacity($clinic, $doctors, $hours, $range['from'], $range['to']);
        $capacityBefore = $this->capacity($clinic, $doctors, $hours, $range['previousFrom'], $range['previousTo']);

        $weekly = $period === 'last3months';
        $length = $this->days($range['from'], $range['to']);
        $currentDays = $this->series($range['from'], $length, $now['perDay']);
        $previousDays = $this->series($range['previousFrom'], $length, $before['perDay']);

        [$confirmed, $confirmable] = $this->confirmation($clock, $range['from'], $range['to']);
        [$confirmedBefore, $confirmableBefore] = $this->confirmation($clock, $range['previousFrom'], $range['previousTo']);
        [$sentNow, $triedNow] = $this->reminders($clock, $range['from'], $range['to']);
        [$sentBefore, $triedBefore] = $this->reminders($clock, $range['previousFrom'], $range['previousTo']);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $today,
            'period' => ['id' => $period, ...array_intersect_key($range, array_flip(['from', 'to', 'previousFrom', 'previousTo']))],
            'kpis' => [
                'booked' => $this->kpi($now['booked'], $before['booked']),
                'done' => $this->kpi($now['done'], $before['done']),
                'cancellationRate' => $this->kpi($this->percent($now['cancelled'], $now['booked']), $this->percent($before['cancelled'], $before['booked'])),
                'noShowRate' => $this->kpi($this->percent($now['noShow'], $now['booked']), $this->percent($before['noShow'], $before['booked'])),
                'newPatients' => $this->kpi($this->newPatients($clock, $range['from'], $range['to']), $this->newPatients($clock, $range['previousFrom'], $range['previousTo'])),
                'reminderDelivery' => $this->kpi($this->percent($sentNow, $triedNow), $this->percent($sentBefore, $triedBefore)),
                'confirmed' => $this->kpi($this->percent($confirmed, $confirmable), $this->percent($confirmedBefore, $confirmableBefore)),
                // Walk-ins and over-booking can pass 100%; the page shows the clinic as full, not as more than full.
                'doctorTimeUsed' => $this->kpi(
                    min(100.0, $this->percent($this->sumMinutes($now['byDoctor'], $capacity), array_sum($capacity))),
                    min(100.0, $this->percent($this->sumMinutes($before['byDoctor'], $capacityBefore), array_sum($capacityBefore))),
                ),
            ],
            'trend' => [
                'granularity' => $weekly ? 'week' : 'day',
                'points' => $weekly
                    ? $this->weeks($range['from'], $currentDays, $previousDays)
                    : $this->daily($range['from'], $currentDays, $previousDays),
            ],
            'weekdays' => $this->weekdays($range['from'], $currentDays),
            'outcomes' => ['done' => $now['done'], 'upcoming' => $now['open'], 'cancelled' => $now['cancelled'], 'noShow' => $now['noShow']],
            'sources' => ['voice' => $now['voice'], 'manual' => $now['booked'] - $now['voice']],
            'doctorUse' => $this->doctorUse($doctors, $now['byDoctor'], $capacity),
            'services' => $this->serviceShares($services, $now),
            'todayDoctors' => $this->todayDoctors($clinic, $clock, $today, $doctors, $services, $hours),
            'alerts' => [
                'failedMessages' => Message::query()->where('status', 'failed')->whereNull('resent_at')->count(),
                'doctorsWithoutHours' => $doctors->filter(fn (Doctor $d) => $hours[$d->id]['windows'] === [])
                    ->map(fn (Doctor $d) => ['id' => $d->id, 'name' => $d->display_name])->values()->all(),
            ],
        ];
    }

    /**
     * The days of a period and of the one before it, of the same length where the calendar allows (a month is compared with the
     * whole of the month before, up to the same day of the month, and no further than that month's end).
     *
     * @return array{from: string, to: string, previousFrom: string, previousTo: string}
     */
    private function ranges(string $period, string $today): array
    {
        $end = CarbonImmutable::parse($today);

        if ($period === 'last7') {
            return $this->range($end->subDays(6), $end, $end->subDays(13), $end->subDays(7));
        }

        if ($period === 'month') {
            $from = $end->startOfMonth();
            $previousFrom = $from->subMonthNoOverflow()->startOfMonth();

            return $this->range($from, $end, $previousFrom, min($previousFrom->addDays($end->day - 1), $previousFrom->endOfMonth()->startOfDay()));
        }

        // Three months: thirteen whole weeks ending with the current one.
        $from = $end->startOfWeek(CarbonImmutable::MONDAY)->subWeeks(12);
        $length = (int) $from->diffInDays($end) + 1;

        return $this->range($from, $end, $from->subDays($length), $from->subDay());
    }

    /**
     * @return array{from: string, to: string, previousFrom: string, previousTo: string}
     */
    private function range(CarbonImmutable $from, CarbonImmutable $to, CarbonImmutable $previousFrom, CarbonImmutable $previousTo): array
    {
        return [
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'previousFrom' => $previousFrom->format('Y-m-d'),
            'previousTo' => $previousTo->format('Y-m-d'),
        ];
    }

    private function days(string $from, string $to): int
    {
        return (int) CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
    }

    /**
     * Counts for the appointments whose visit falls on the clinic-local days `$from` to `$to`.
     *
     * @param  array<string, int>  $durations  service id => minutes
     * @return Tally
     */
    private function tally(ClinicClock $clock, string $from, string $to, array $durations): array
    {
        $within = fn () => Appointment::query()
            ->where('starts_at', '>=', $clock->startOfDay($from))
            ->where('starts_at', '<', $clock->endOfDay($to));

        $tally = ['booked' => 0, 'done' => 0, 'cancelled' => 0, 'noShow' => 0, 'open' => 0, 'voice' => 0, 'kept' => 0, 'byService' => [], 'byDoctor' => [], 'perDay' => []];

        $groups = $within()->selectRaw('doctor_id, service_id, status, source, count(*) as n')->groupBy('doctor_id', 'service_id', 'status', 'source')->get();

        foreach ($groups as $group) {
            $n = (int) $group->getAttribute('n');
            $status = (string) $group->status->value;
            $tally['booked'] += $n;
            $tally['done'] += $status === 'done' ? $n : 0;
            $tally['cancelled'] += $status === 'cancelled' ? $n : 0;
            $tally['noShow'] += $status === 'no_show' ? $n : 0;
            $tally['open'] += in_array($status, self::OPEN, true) ? $n : 0;
            $tally['voice'] += $group->source->value === 'voice' ? $n : 0;

            if ($status !== 'cancelled') {
                $tally['kept'] += $n;
                $tally['byService'][$group->service_id] = ($tally['byService'][$group->service_id] ?? 0) + $n;
                $mine = $tally['byDoctor'][$group->doctor_id] ?? ['count' => 0, 'minutes' => 0];
                $tally['byDoctor'][$group->doctor_id] = ['count' => $mine['count'] + $n, 'minutes' => $mine['minutes'] + $n * ($durations[$group->service_id] ?? 0)];
            }
        }

        foreach ($within()->selectRaw('starts_at, count(*) as n')->groupBy('starts_at')->get() as $time) {
            $date = $clock->dateOf($time->starts_at);
            $tally['perDay'][$date] = ($tally['perDay'][$date] ?? 0) + (int) $time->getAttribute('n');
        }

        return $tally;
    }

    /**
     * @return array{0: int, 1: int} confirmed, and how many could have been (not cancelled, not walk-ins)
     */
    private function confirmation(ClinicClock $clock, string $from, string $to): array
    {
        $eligible = fn () => Appointment::query()
            ->where('starts_at', '>=', $clock->startOfDay($from))
            ->where('starts_at', '<', $clock->endOfDay($to))
            ->where('status', '!=', 'cancelled')->where('source', '!=', 'walk_in');

        $confirmed = $eligible()->where(fn ($q) => $q->where('status', 'confirmed')->orWhereExists(
            fn ($reply) => $reply->selectRaw('1')->from('patient_replies')
                ->whereColumn('patient_replies.appointment_id', 'appointments.id')->where('patient_replies.action', 'confirm'),
        ))->count();

        return [$confirmed, $eligible()->count()];
    }

    /**
     * @return array{0: int, 1: int} reminders that went out, and reminders that were tried (a patient who had not consented was not tried)
     */
    private function reminders(ClinicClock $clock, string $from, string $to): array
    {
        $tried = Message::query()->where('kind', 'reminder')->whereIn('status', ['sent', 'delivered', 'failed'])
            ->where(fn ($q) => $q->whereNull('failure_reason')->orWhere('failure_reason', '!=', 'no_consent'))
            ->where('created_at', '>=', $clock->startOfDay($from))->where('created_at', '<', $clock->endOfDay($to));

        return [(clone $tried)->whereIn('status', ['sent', 'delivered'])->count(), $tried->count()];
    }

    private function newPatients(ClinicClock $clock, string $from, string $to): int
    {
        return Patient::query()->where('created_at', '>=', $clock->startOfDay($from))->where('created_at', '<', $clock->endOfDay($to))->count();
    }

    /**
     * The minutes each active doctor works on each day from `$from` to `$to`, summed per doctor: their weekly hours (minus
     * lunch gaps and closed half hours) inside the clinic's business hours, on days that are neither a holiday nor their leave.
     *
     * @param  Collection<int, Doctor>  $doctors
     * @param  array<string, array{windows: list<array{weekday: int, start: string, end: string, breaks: list<array{start: string, end: string}>}>, timeOff: list<array{startDate: string, endDate: string}>, blocked: list<array{weekday: int, time: string}>}>  $hours
     * @return array<string, int> doctor id => minutes
     */
    private function capacity(Clinic $clinic, $doctors, array $hours, string $from, string $to): array
    {
        $business = [];

        foreach ($clinic->settingsData()->businessHours as $day) {
            $business[$day['weekday']] = [SlotRules::minutes($day['open']), SlotRules::minutes($day['close'])];
        }

        $holidays = ClinicHoliday::query()->whereBetween('date', [$from, $to])->get()
            ->mapWithKeys(fn (ClinicHoliday $holiday) => [$holiday->date->format('Y-m-d') => true])->all();

        $out = [];

        foreach ($doctors as $doctor) {
            $mine = $hours[$doctor->id];
            $perWeekday = array_fill(0, 7, 0);
            $closed = [];

            foreach ($mine['blocked'] as $slot) {
                $closed[$slot['weekday']][SlotRules::minutes($slot['time'])] = true;
            }

            foreach ($mine['windows'] as $window) {
                if (! isset($business[$window['weekday']])) {
                    continue;
                }

                [$open, $close] = $business[$window['weekday']];
                $end = min(SlotRules::minutes($window['end']), $close, SlotRules::LATEST);

                for ($m = max(SlotRules::minutes($window['start']), $open, SlotRules::EARLIEST); $m + SlotRules::GRID <= $end; $m += SlotRules::GRID) {
                    $lunch = false;

                    foreach ($window['breaks'] as $gap) {
                        $lunch = $lunch || ($m >= SlotRules::minutes($gap['start']) && $m < SlotRules::minutes($gap['end']));
                    }

                    if (! $lunch && ! isset($closed[$window['weekday']][$m])) {
                        $perWeekday[$window['weekday']] += SlotRules::GRID;
                    }
                }
            }

            $total = 0;

            for ($day = CarbonImmutable::parse($from); $day->format('Y-m-d') <= $to; $day = $day->addDay()) {
                $date = $day->format('Y-m-d');
                $away = isset($holidays[$date]) || collect($mine['timeOff'])->contains(fn (array $off) => $off['startDate'] <= $date && $date <= $off['endDate']);

                $total += $away ? 0 : $perWeekday[$day->dayOfWeek];
            }

            $out[$doctor->id] = $total;
        }

        return $out;
    }

    /**
     * @param  array<string, array{count: int, minutes: int}>  $byDoctor
     * @param  array<string, int>  $capacity
     */
    private function sumMinutes(array $byDoctor, array $capacity): int
    {
        // Only the time of doctors who are still working counts against the time they have.
        return (int) array_sum(array_map(fn (string $id) => $byDoctor[$id]['minutes'] ?? 0, array_keys($capacity)));
    }

    /**
     * One count for every day of the period, in order.
     *
     * @param  array<string, int>  $perDay
     * @return list<int>
     */
    private function series(string $from, int $length, array $perDay): array
    {
        $start = CarbonImmutable::parse($from);

        return array_map(fn (int $i) => $perDay[$start->addDays($i)->format('Y-m-d')] ?? 0, range(0, $length - 1));
    }

    /**
     * @param  list<int>  $current
     * @param  list<int>  $previous
     * @return list<array{date: string, current: int, previous: int}>
     */
    private function daily(string $from, array $current, array $previous): array
    {
        $start = CarbonImmutable::parse($from);

        return array_map(fn (int $i) => ['date' => $start->addDays($i)->format('Y-m-d'), 'current' => $current[$i], 'previous' => $previous[$i] ?? 0], array_keys($current));
    }

    /**
     * Thirteen weekly points (each the Monday that week starts on); the last week is the part of it so far.
     *
     * @param  list<int>  $current
     * @param  list<int>  $previous
     * @return list<array{date: string, current: int, previous: int}>
     */
    private function weeks(string $from, array $current, array $previous): array
    {
        $start = CarbonImmutable::parse($from);

        return array_map(fn (int $i) => [
            'date' => $start->addDays($i * 7)->format('Y-m-d'),
            'current' => array_sum(array_slice($current, $i * 7, 7)),
            'previous' => array_sum(array_slice($previous, $i * 7, 7)),
        ], range(0, 12));
    }

    /**
     * Appointments per weekday, Monday first.
     *
     * @param  list<int>  $current
     * @return list<int>
     */
    private function weekdays(string $from, array $current): array
    {
        $start = CarbonImmutable::parse($from);
        $counts = array_fill(0, 7, 0);

        foreach ($current as $i => $count) {
            $counts[($start->addDays($i)->dayOfWeek + 6) % 7] += $count;
        }

        return array_values($counts);
    }

    /**
     * The five busiest doctors, by the share of their working time that is booked.
     *
     * @param  Collection<int, Doctor>  $doctors
     * @param  array<string, array{count: int, minutes: int}>  $byDoctor
     * @param  array<string, int>  $capacity
     * @return list<array{doctorId: string, name: string, utilisation: float, booked: int}>
     */
    private function doctorUse($doctors, array $byDoctor, array $capacity): array
    {
        $rows = $doctors->map(fn (Doctor $doctor) => [
            'doctorId' => $doctor->id,
            'name' => $doctor->display_name,
            'utilisation' => $capacity[$doctor->id] === 0 ? 0.0 : round(min(1, ($byDoctor[$doctor->id]['minutes'] ?? 0) / $capacity[$doctor->id]), 3),
            'booked' => $byDoctor[$doctor->id]['count'] ?? 0,
        ])->all();

        usort($rows, fn (array $a, array $b) => [$b['utilisation'], $b['booked'], $a['name']] <=> [$a['utilisation'], $a['booked'], $b['name']]);

        return array_slice($rows, 0, 5);
    }

    /**
     * The three most booked services and their share of everything booked (not cancelled).
     *
     * @param  Collection<int, Service>  $services
     * @param  Tally  $tally
     * @return list<array{serviceId: string, name: string, share: float, booked: int}>
     */
    private function serviceShares($services, array $tally): array
    {
        $rows = $services->filter(fn (Service $service) => ($tally['byService'][$service->id] ?? 0) > 0)->map(fn (Service $service) => [
            'serviceId' => $service->id,
            'name' => $service->name,
            'share' => round($tally['byService'][$service->id] / $tally['kept'], 3),
            'booked' => $tally['byService'][$service->id],
        ])->all();

        usort($rows, fn (array $a, array $b) => [$b['booked'], $a['name']] <=> [$a['booked'], $b['name']]);

        return array_slice($rows, 0, 3);
    }

    /**
     * Each active doctor's day so far, and when they next have a free slot.
     *
     * @param  Collection<int, Doctor>  $doctors
     * @param  Collection<int, Service>  $services
     * @param  array<string, mixed>  $hours
     * @return array<int, array<string, mixed>>
     */
    private function todayDoctors(Clinic $clinic, ClinicClock $clock, string $today, $doctors, $services, array $hours): array
    {
        $counts = [];

        $groups = Appointment::query()->where('starts_at', '>=', $clock->startOfDay($today))->where('starts_at', '<', $clock->endOfDay($today))
            ->where('status', '!=', 'cancelled')->selectRaw('doctor_id, status, count(*) as n')->groupBy('doctor_id', 'status')->get();

        foreach ($groups as $group) {
            $counts[$group->doctor_id][$group->status->value] = (int) $group->getAttribute('n');
        }

        return $doctors->map(function (Doctor $doctor) use ($clinic, $services, $counts): array {
            $mine = $counts[$doctor->id] ?? [];
            $service = DoctorAvailabilityView::defaultService($doctor, $services);

            return [
                'doctor' => DoctorView::of($doctor),
                'booked' => array_sum($mine),
                'arrived' => $mine['arrived'] ?? 0,
                'inConsultation' => $mine['in_consultation'] ?? 0,
                'done' => $mine['done'] ?? 0,
                'nextFree' => $service === null ? null : $this->slots->nextFree($clinic, $doctor, $service)?->toArray(),
            ];
        })->values()->all();
    }

    /**
     * @return array{value: int|float, previous: int|float}
     */
    private function kpi(int|float $value, int|float $previous): array
    {
        return ['value' => $value, 'previous' => $previous];
    }

    /** A share as a percentage with one decimal; nothing to share is 0. */
    private function percent(int $part, int $whole): float
    {
        return $whole === 0 ? 0.0 : round($part / $whole * 100, 1);
    }
}
