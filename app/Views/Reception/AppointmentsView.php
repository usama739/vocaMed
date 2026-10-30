<?php

namespace App\Views\Reception;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use App\Services\AppointmentSearch;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;
use Carbon\CarbonImmutable;

/**
 * `AppointmentsView` (B2): a page of appointment rows. `when` is relative to the clinic's today: any time, today, the next 7 days
 * or the last 7 days.
 */
final class AppointmentsView
{
    public const PER_PAGE = 10;

    public function __construct(private readonly AppointmentSearch $search, private readonly AppointmentRows $rows) {}

    /**
     * @param  array{when: string, doctorId?: string, status?: string, q?: string, sort: string, page: int, perPage?: int}  $params
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, array $params): array
    {
        $today = ClinicClock::for($clinic)->today();
        $day = fn (int $offset): string => CarbonImmutable::parse($today)->addDays($offset)->format('Y-m-d');

        $range = match ($params['when']) {
            'today' => ['from' => $today, 'to' => $today],
            'next7' => ['from' => $today, 'to' => $day(7)],
            'past7' => ['from' => $day(-7), 'to' => $day(-1)],
            default => [],
        };

        $filters = [
            ...$range,
            ...(isset($params['doctorId']) ? ['doctorId' => $params['doctorId']] : []),
            ...(isset($params['status']) ? ['status' => $params['status']] : []),
            ...(isset($params['q']) ? ['patient' => $params['q']] : []),
            'sort' => $params['sort'] === 'asc' ? 'startsAt' : '-startsAt',
            'page' => $params['page'],
            'perPage' => $params['perPage'] ?? self::PER_PAGE,
        ];

        $result = $this->search->page($clinic, $filters);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $today,
            'doctors' => Doctor::query()->with('services')->orderBy('display_name')->get()->map(fn (Doctor $d) => DoctorView::of($d))->all(),
            'page' => [
                'items' => $this->rows->of($clinic, $viewer, $result['items']),
                'total' => $result['total'],
                'page' => $result['page'],
                'perPage' => $result['perPage'],
            ],
        ];
    }
}
