<?php

namespace App\Views\Reception;

use App\Booking\SlotService;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\DoctorView;
use App\Views\ServiceView;
use Carbon\CarbonImmutable;

/**
 * `TodayView` (B1): every active doctor's day. Each doctor has today's appointments in time order, the next free slot for their
 * default service, and whether they are working at all today (a holiday, leave or a day off).
 */
final class TodayView
{
    public function __construct(
        private readonly AppointmentRows $rows,
        private readonly DoctorAvailabilityView $hours,
        private readonly SlotService $slots,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $viewer): array
    {
        $clock = ClinicClock::for($clinic);
        $today = $clock->today();
        $weekday = CarbonImmutable::parse($today)->dayOfWeek;

        $services = Service::query()->get()->sortBy('name')->values();
        $doctors = Doctor::query()->with('services')->where('is_active', true)->orderBy('display_name')->get();
        $availability = $this->hours->forDoctors($doctors);
        $holiday = ClinicHoliday::query()->whereDate('date', $today)->exists();

        $todays = Appointment::query()
            ->where('starts_at', '>=', $clock->startOfDay($today))
            ->where('starts_at', '<', $clock->endOfDay($today))
            ->orderBy('starts_at')->orderBy('id')
            ->get();

        $byDoctor = [];

        foreach ($this->rows->of($clinic, $viewer, $todays) as $row) {
            $byDoctor[$row['appointment']['doctorId']][] = $row;
        }

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => $today,
            'services' => $services->map(fn (Service $service) => ServiceView::of($service))->all(),
            'days' => $doctors->map(function (Doctor $doctor) use ($clinic, $services, $availability, $holiday, $today, $weekday, $byDoctor): array {
                $service = DoctorAvailabilityView::defaultService($doctor, $services);
                $hours = $availability[$doctor->id];
                $off = collect($hours['timeOff'])->contains(fn (array $leave) => $leave['startDate'] <= $today && $today <= $leave['endDate']);

                return [
                    'doctor' => DoctorView::of($doctor),
                    'rows' => $byDoctor[$doctor->id] ?? [],
                    'nextFree' => $service === null ? null : $this->slots->nextFree($clinic, $doctor, $service)?->toArray(),
                    'notWorking' => $holiday || $off || ! collect($hours['windows'])->contains('weekday', $weekday),
                ];
            })->values()->all(),
        ];
    }
}
