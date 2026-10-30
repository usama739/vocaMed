<?php

namespace Tests\Concerns;

use App\Booking\Cells;
use App\Data\AvailabilityDraft;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Services\AvailabilityService;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A small clinic for booking tests: Asia/Karachi (UTC+5), open Monday to Saturday 09:00 to 17:00, one doctor working Monday to
 * Friday 09:00 to 17:00 who offers a 30-minute service with a 10-minute buffer, a receptionist, an admin and a patient. "Now" is
 * fixed to Sunday 2026-11-01 15:00 clinic time, so Monday 2026-11-02 is the first bookable day.
 */
trait BuildsBookingWorld
{
    protected Clinic $clinic;

    protected User $reception;

    protected User $admin;

    protected Doctor $doctor;

    protected Service $service;

    protected Patient $patient;

    /** The first Monday after "now". */
    protected string $monday = '2026-11-02';

    protected function buildBookingWorld(): void
    {
        config(['vocamed.real_auth' => true, 'vocamed.holds_store' => 'array']);
        Carbon::setTestNow('2026-11-01 10:00:00');

        $this->clinic = Clinic::factory()->create(['country' => 'PK', 'timezone' => 'Asia/Karachi']);
        $this->reception = User::factory()->receptionist()->forClinic($this->clinic)->create();
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
        $this->doctor = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Sana']);
        $this->service = Service::factory()->forClinic($this->clinic)->create(['name' => 'Check-up', 'duration_minutes' => 30, 'buffer_minutes' => 10]);
        $this->doctor->services()->sync([$this->service->id]);
        $this->patient = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ayesha Khan']);

        $this->workWeekdays($this->doctor);
    }

    protected function tearDownBookingWorld(): void
    {
        Carbon::setTestNow();
    }

    /**
     * Give a doctor Monday to Friday hours.
     *
     * @param  array<string, mixed>  $overrides  per weekday: weekday => ['start' => , 'end' => , 'lunch' => , 'on' => ]
     */
    protected function workWeekdays(Doctor $doctor, array $overrides = [], array $timeOff = [], array $blocked = []): void
    {
        $draft = AvailabilityDraft::blank();

        foreach ($draft['days'] as $i => $day) {
            $draft['days'][$i] = [...$day, ...($overrides[$day['weekday']] ?? [])];
        }

        $draft['timeOff'] = $timeOff;
        $draft['blocked'] = $blocked;

        app(TenantContext::class)->run($doctor->clinic ?? $this->clinic, fn () => app(AvailabilityService::class)->save($doctor, $draft));
    }

    /** The UTC instant of a clinic-local time, such as `at('2026-11-02 10:00')`. */
    protected function at(string $local): CarbonImmutable
    {
        return CarbonImmutable::parse($local, 'Asia/Karachi')->utc();
    }

    /** Take a doctor's time (and its buffer) without going through booking, for slot tests. */
    protected function occupy(Doctor $doctor, string $local, int $minutes = 40): void
    {
        $id = (string) Str::ulid();
        $start = $this->at($local);

        DB::table('appointments')->insert([
            'id' => $id, 'clinic_id' => $doctor->clinic_id, 'doctor_id' => $doctor->id, 'patient_id' => $this->patient->id, 'service_id' => $this->service->id,
            'starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $start->addMinutes(30)->format('Y-m-d H:i:s'), 'status' => 'booked', 'source' => 'manual',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        foreach (Cells::between($start, $start->addMinutes($minutes)) as $cell) {
            DB::table('appointment_slots')->insert(['appointment_id' => $id, 'doctor_id' => $doctor->id, 'cell_start' => $cell]);
        }
    }
}
