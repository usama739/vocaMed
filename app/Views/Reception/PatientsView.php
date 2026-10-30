<?php

namespace App\Views\Reception;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Patient;
use App\Services\PatientDirectory;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\PatientView;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * `PatientsView` (B5): the patients found by a search (up to 25), or the recent ones, each with when they were last seen and when
 * they are next booked.
 */
final class PatientsView
{
    public const SEARCH_LIMIT = 25;

    public const RECENT_LIMIT = 8;

    public function __construct(private readonly PatientDirectory $patients) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, string $query): array
    {
        $found = trim($query) === '' ? $this->patients->recent(self::RECENT_LIMIT) : $this->patients->search($query, self::SEARCH_LIMIT);
        $clock = ClinicClock::for($clinic);
        // Stored times are UTC, so they are compared with the UTC "now".
        $now = $clock->now()->utc();

        $last = $this->earliestOrLatest($found, ['arrived', 'in_consultation', 'done'], '<=', $now, true);
        $next = $this->earliestOrLatest($found, ['booked', 'confirmed'], '>=', $now, false);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $clock->today(),
            'rows' => $found->map(fn (Patient $patient) => [
                'patient' => PatientView::of($patient),
                'lastVisit' => $last[$patient->id] ?? null,
                'next' => $next[$patient->id] ?? null,
            ])->values()->all(),
        ];
    }

    /**
     * One time per patient from their appointments in the given statuses, read for all of them in one query: the latest that has
     * begun (`$latest`, for the last visit) or the earliest still to come (for the next appointment).
     *
     * @param  Collection<int, Patient>  $patients
     * @param  list<string>  $statuses
     * @return array<string, string>
     */
    private function earliestOrLatest(Collection $patients, array $statuses, string $against, CarbonImmutable $now, bool $latest): array
    {
        if ($patients->isEmpty()) {
            return [];
        }

        $times = [];

        $query = Appointment::query()->whereIn('patient_id', $patients->modelKeys())
            ->whereIn('status', $statuses)->where('starts_at', $against, $now)->groupBy('patient_id');

        $rows = $latest ? $query->selectRaw('patient_id, max(starts_at) as at')->get() : $query->selectRaw('patient_id, min(starts_at) as at')->get();

        foreach ($rows as $row) {
            $times[(string) $row->getAttribute('patient_id')] = CarbonImmutable::parse((string) $row->getAttribute('at'), 'UTC')->format('Y-m-d\TH:i:s.v\Z');
        }

        return $times;
    }
}
