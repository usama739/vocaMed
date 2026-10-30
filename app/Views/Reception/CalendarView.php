<?php

namespace App\Views\Reception;

use App\Authorization\Ability;
use App\Authorization\Access;
use App\Authorization\Permissions;
use App\Booking\SlotService;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\Admin\SettingsView;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\ServiceView;
use Illuminate\Support\Collection;

/**
 * `CalendarViewData` (B4, and the doctor's schedule later): the appointments of a day, a week or a month, and for the day view one
 * column per doctor with that day's slots and hours. A doctor only ever gets their own appointments.
 */
final class CalendarView
{
    /** A busy month stays well below this; the page also offers a doctor filter. */
    public const MAX_ROWS = 3000;

    public function __construct(
        private readonly AppointmentRows $rows,
        private readonly DoctorAvailabilityView $hours,
        private readonly SlotService $slots,
    ) {}

    /**
     * @param  array{view: string, date: string|null, doctorId: string}  $params  `doctorId` is `all` or one doctor's id
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer, array $params): array
    {
        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $date = $params['date'] ?? $today;
        $range = CalendarRange::of($params['view'], $date);

        $services = Service::query()->get()->sortBy('name')->values();
        $allDoctors = Doctor::query()->with('services')->where('is_active', true)->orderBy('display_name')->get();
        $shown = $params['doctorId'] === 'all' ? $allDoctors : $allDoctors->where('id', $params['doctorId'])->values();

        $query = Appointment::query()
            ->where('starts_at', '>=', $clock->startOfDay($range['from']))
            ->where('starts_at', '<', $clock->endOfDay($range['to']));

        if ($params['doctorId'] !== 'all') {
            $query->where('doctor_id', $params['doctorId']);
        }

        if (Permissions::access($viewer, Ability::ViewAppointments) === Access::Own) {
            $query->whereIn('doctor_id', Doctor::query()->where('user_id', $viewer->id)->select('id'));
        }

        $appointments = $query->orderBy('starts_at')->orderBy('id')->limit(self::MAX_ROWS)->get();

        return [
            'clinic' => ClinicView::of($clinic),
            'settings' => SettingsView::of($clinic)['settings'],
            'today' => $today,
            'date' => $date,
            'allDoctors' => $allDoctors->map(fn (Doctor $d) => DoctorView::of($d))->all(),
            'doctors' => $shown->map(fn (Doctor $d) => DoctorView::of($d))->all(),
            'rows' => $this->rows->of($clinic, $viewer, $appointments),
            'columns' => $params['view'] === 'day' ? $this->columns($clinic, $viewer, $shown, $services, $date) : [],
            'nowIso' => $clock->now()->utc()->format('Y-m-d\TH:i:s.v\Z'),
        ];
    }

    /**
     * @param  Collection<int, Doctor>  $doctors
     * @param  Collection<int, Service>  $services
     * @return array<int, array<string, mixed>>
     */
    private function columns(Clinic $clinic, User $viewer, Collection $doctors, Collection $services, string $date): array
    {
        $availability = $this->hours->forDoctors($doctors);
        $holiday = ClinicHoliday::query()->whereDate('date', $date)->exists();

        return $doctors->map(function (Doctor $doctor) use ($clinic, $viewer, $services, $availability, $holiday, $date): array {
            $service = DoctorAvailabilityView::defaultService($doctor, $services);
            $hours = $availability[$doctor->id];

            return [
                'doctor' => DoctorView::of($doctor),
                // The key is left out when the doctor offers nothing bookable, as `service: undefined` on the screens.
                ...($service === null ? [] : ['service' => ServiceView::of($service)]),
                'slots' => $service === null ? [] : array_map(fn ($slot) => $slot->toArray(), $this->slots->slots($clinic, $doctor, $service, $date, null, $viewer)),
                'availability' => $hours,
                'offToday' => $holiday || collect($hours['timeOff'])->contains(fn (array $leave) => $leave['startDate'] <= $date && $date <= $leave['endDate']),
            ];
        })->values()->all();
    }
}
