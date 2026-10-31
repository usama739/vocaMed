<?php

namespace Tests\Feature\Admin;

use App\Enums\AppointmentStatus;
use App\Enums\BookingSource;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** The admin Overview (D1): what the numbers count, the period before it, tenant isolation and who may read it. */
class OverviewViewTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        // Monday 10:00 in the clinic.
        Carbon::setTestNow('2026-11-02 05:00:00');
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function visit(string $local, array $state = [], ?Doctor $doctor = null, ?Service $service = null): Appointment
    {
        $start = $this->at($local);

        return Appointment::factory()->forClinic($this->clinic, $doctor ?? $this->doctor, $this->patient, $service ?? $this->service)
            ->create(['starts_at' => $start, 'ends_at' => $start->addMinutes(30), ...$state]);
    }

    /** @return array<string, mixed> */
    private function overview(array $query = []): array
    {
        return $this->actingAs($this->admin)->getJson('/admin'.($query === [] ? '' : '?'.http_build_query($query)))->assertOk()->json();
    }

    private function message(string $kind, string $status, ?string $reason = null, ?string $resentAt = null): void
    {
        $visit = $this->visit('2026-11-02 16:00');

        DB::table('messages')->insert([
            'id' => (string) Str::ulid(), 'clinic_id' => $this->clinic->id, 'appointment_id' => $visit->id, 'patient_id' => $this->patient->id,
            'kind' => $kind, 'channel' => 'sms', 'status' => $status, 'failure_reason' => $reason, 'dedupe_key' => (string) Str::ulid(),
            'resent_at' => $resentAt, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $this->visit('2026-11-02 10:00');
        $this->message('reminder', 'failed', 'unreachable');
        $other = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Zain Ali']);
        $other->services()->sync([$this->service->id]);

        $this->assertSameShape($this->fixture('admin-overview-view'), $this->overview());
    }

    public function test_the_address_without_a_json_request_is_still_the_page()
    {
        $this->actingAs($this->admin)->get('/admin')->assertInertia(fn ($page) => $page->component('admin/overview'));
    }

    public function test_only_the_clinic_admin_may_read_it()
    {
        $this->actingAs($this->reception)->getJson('/admin')->assertForbidden();
        $this->actingAs(User::factory()->doctor()->forClinic($this->clinic)->create())->getJson('/admin')->assertForbidden();
    }

    public function test_the_period_is_the_month_unless_another_known_one_is_asked_for()
    {
        $this->assertSame('month', $this->overview()['period']['id']);
        $this->assertSame('month', $this->overview(['period' => 'bogus'])['period']['id']);
        $this->assertSame('last7', $this->overview(['period' => 'last7'])['period']['id']);
    }

    public function test_the_counts_add_up_and_the_rates_are_shares_of_what_was_booked()
    {
        $this->visit('2026-11-02 10:00', ['status' => AppointmentStatus::Done]);
        $reminded = $this->visit('2026-11-02 10:30', ['status' => AppointmentStatus::Done]);
        $this->visit('2026-11-02 11:00', ['status' => AppointmentStatus::Cancelled]);
        $this->visit('2026-11-02 11:30', ['status' => AppointmentStatus::NoShow]);
        $this->visit('2026-11-02 12:00');
        $this->visit('2026-11-02 12:30', ['status' => AppointmentStatus::Confirmed, 'source' => BookingSource::Voice]);
        $this->visit('2026-11-02 09:00', ['status' => AppointmentStatus::Arrived, 'source' => BookingSource::WalkIn]);
        // The patient confirmed the first one through their link; a walk-in cannot be confirmed.
        DB::table('patient_replies')->insert(['id' => (string) Str::ulid(), 'clinic_id' => $this->clinic->id, 'appointment_id' => $reminded->id, 'patient_id' => $this->patient->id, 'action' => 'confirm', 'created_at' => now()]);

        // The month before, and another clinic's day, which must not count.
        $this->visit('2026-10-01 10:00', ['status' => AppointmentStatus::Done]);
        $this->visit('2026-10-02 10:00', ['status' => AppointmentStatus::Cancelled]);
        Appointment::factory()->forClinic(Clinic::factory()->create())->create(['starts_at' => $this->at('2026-11-02 10:00')]);
        Patient::factory()->forClinic($this->clinic)->create();

        $view = $this->overview();

        $this->assertSame(['id' => 'month', 'from' => '2026-11-01', 'to' => '2026-11-02', 'previousFrom' => '2026-10-01', 'previousTo' => '2026-10-02'], $view['period']);
        $this->assertSame(['value' => 7, 'previous' => 2], $view['kpis']['booked']);
        $this->assertSame(['value' => 2, 'previous' => 1], $view['kpis']['done']);
        $this->assertSame(['value' => 14.3, 'previous' => 50.0], $view['kpis']['cancellationRate']);
        $this->assertSame(['value' => 14.3, 'previous' => 0.0], $view['kpis']['noShowRate']);
        $this->assertSame(['value' => 2, 'previous' => 0], $view['kpis']['newPatients']);
        $this->assertSame(['value' => 40.0, 'previous' => 0.0], $view['kpis']['confirmed']);
        $this->assertSame(['done' => 2, 'upcoming' => 3, 'cancelled' => 1, 'noShow' => 1], $view['outcomes']);
        $this->assertSame(7, array_sum($view['outcomes']));
        $this->assertSame(['voice' => 1, 'manual' => 6], $view['sources']);
    }

    public function test_the_trend_counts_by_the_clinics_day_not_the_utc_day()
    {
        // 02:00 on Monday in Karachi is still Sunday in UTC.
        $this->visit('2026-11-02 02:00');
        $this->visit('2026-11-02 10:00');

        $view = $this->overview();

        $this->assertSame('day', $view['trend']['granularity']);
        $this->assertSame([['date' => '2026-11-01', 'current' => 0, 'previous' => 0], ['date' => '2026-11-02', 'current' => 2, 'previous' => 0]], $view['trend']['points']);
        $this->assertSame([2, 0, 0, 0, 0, 0, 0], $view['weekdays']);
    }

    public function test_the_last_seven_days_and_the_last_three_months_have_their_own_shapes()
    {
        $this->visit('2026-10-27 10:00');
        $this->visit('2026-11-02 10:00');
        $this->visit('2026-09-01 10:00');

        $week = $this->overview(['period' => 'last7']);
        $this->assertSame(['id' => 'last7', 'from' => '2026-10-27', 'to' => '2026-11-02', 'previousFrom' => '2026-10-20', 'previousTo' => '2026-10-26'], $week['period']);
        $this->assertCount(7, $week['trend']['points']);
        $this->assertSame([1, 0, 0, 0, 0, 0, 1], array_column($week['trend']['points'], 'current'));
        // Monday 2 November and Tuesday 27 October.
        $this->assertSame([1, 1, 0, 0, 0, 0, 0], $week['weekdays']);

        $quarter = $this->overview(['period' => 'last3months']);
        $this->assertSame(['id' => 'last3months', 'from' => '2026-08-10', 'to' => '2026-11-02', 'previousFrom' => '2026-05-17', 'previousTo' => '2026-08-09'], $quarter['period']);
        $this->assertSame('week', $quarter['trend']['granularity']);
        $this->assertCount(13, $quarter['trend']['points']);
        $this->assertSame('2026-08-10', $quarter['trend']['points'][0]['date']);
        $this->assertSame('2026-11-02', $quarter['trend']['points'][12]['date']);
        // 1 September is in the week of 31 August (the fourth); 27 October and 2 November are in the last two.
        $this->assertSame(1, $quarter['trend']['points'][3]['current']);
        $this->assertSame(1, $quarter['trend']['points'][11]['current']);
        $this->assertSame(1, $quarter['trend']['points'][12]['current']);
        $this->assertSame(3, $quarter['kpis']['booked']['value']);
    }

    public function test_a_month_is_compared_with_the_month_before_and_never_past_its_end()
    {
        Carbon::setTestNow('2026-03-31 06:00:00');

        $period = $this->overview()['period'];

        $this->assertSame(['id' => 'month', 'from' => '2026-03-01', 'to' => '2026-03-31', 'previousFrom' => '2026-02-01', 'previousTo' => '2026-02-28'], $period);
    }

    public function test_doctor_time_used_is_booked_minutes_against_the_hours_worked()
    {
        $this->visit('2026-11-02 10:00');
        $this->visit('2026-11-02 10:30');
        $this->visit('2026-11-02 11:00', ['status' => AppointmentStatus::Cancelled]);

        // Monday 09:00 to 17:00 is 480 minutes (Sunday is a day off); two half hours were booked.
        $view = $this->overview();
        $this->assertSame(12.5, $view['kpis']['doctorTimeUsed']['value']);
        $this->assertSame(0.125, $view['doctorUse'][0]['utilisation']);
        $this->assertSame(2, $view['doctorUse'][0]['booked']);

        // A lunch hour is not working time.
        $this->workWeekdays($this->doctor, [1 => ['lunch' => true]]);
        $this->assertSame(14.3, $this->overview()['kpis']['doctorTimeUsed']['value']);

        // Nor is a clinic holiday: nothing to be used, and no dividing by it.
        app(TenantContext::class)->run($this->clinic, fn () => (new ClinicHoliday)->forceFill(['clinic_id' => $this->clinic->id, 'date' => '2026-11-02', 'name' => 'Holiday'])->save());
        $this->assertSame(0.0, $this->overview()['kpis']['doctorTimeUsed']['value']);
        $this->assertSame(0.0, $this->overview()['doctorUse'][0]['utilisation']);
    }

    public function test_the_busiest_services_come_first_with_their_share_of_what_was_not_cancelled()
    {
        $extra = fn (string $name) => Service::factory()->forClinic($this->clinic)->create(['name' => $name]);
        [$scan, $dressing, $vaccine] = [$extra('Scan'), $extra('Dressing'), $extra('Vaccine')];

        foreach (['10:00', '10:30', '11:00'] as $time) {
            $this->visit("2026-11-02 $time");
        }

        $this->visit('2026-11-02 11:30', service: $scan);
        $this->visit('2026-11-02 12:00', service: $scan);
        $this->visit('2026-11-02 12:30', service: $dressing);
        $this->visit('2026-11-02 14:00', service: $vaccine);
        $this->visit('2026-11-02 14:30', ['status' => AppointmentStatus::Cancelled], service: $vaccine);

        $services = $this->overview()['services'];

        $this->assertSame(['Check-up', 'Scan', 'Dressing'], array_column($services, 'name'));
        $this->assertSame([3, 2, 1], array_column($services, 'booked'));
        $this->assertSame(0.429, $services[0]['share']);
    }

    public function test_reminder_delivery_counts_the_reminders_that_were_tried_and_failures_wait_for_a_resend()
    {
        $this->message('reminder', 'sent');
        $this->message('reminder', 'sent');
        $this->message('reminder', 'delivered');
        $this->message('reminder', 'failed', 'unreachable');
        // Not tried: no consent, not yet sent, and not a reminder.
        $this->message('reminder', 'failed', 'no_consent');
        $this->message('reminder', 'queued');
        $this->message('confirmation', 'sent');
        // Already sent again, so nobody needs to look at it.
        $this->message('reminder', 'failed', 'unreachable', '2026-11-02 05:00:00');

        $view = $this->overview();

        $this->assertSame(['value' => 60.0, 'previous' => 0.0], $view['kpis']['reminderDelivery']);
        $this->assertSame(2, $view['alerts']['failedMessages']);
    }

    public function test_today_shows_each_active_doctors_day_and_who_has_no_hours()
    {
        $this->visit('2026-11-02 09:00', ['status' => AppointmentStatus::Arrived]);
        $this->visit('2026-11-02 09:30', ['status' => AppointmentStatus::InConsultation]);
        $this->visit('2026-11-02 10:00', ['status' => AppointmentStatus::Done]);
        $this->visit('2026-11-02 14:00');
        $this->visit('2026-11-02 14:30', ['status' => AppointmentStatus::Cancelled]);
        $this->visit('2026-11-03 10:00');

        $bare = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Zain Ali']);
        $bare->services()->sync([$this->service->id]);
        Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Retired', 'is_active' => false]);

        $view = $this->overview();
        $rows = $view['todayDoctors'];

        $this->assertSame(['Dr. Sana', 'Dr. Zain Ali'], array_column(array_column($rows, 'doctor'), 'name'));
        $this->assertSame([4, 1, 1, 1], [$rows[0]['booked'], $rows[0]['arrived'], $rows[0]['inConsultation'], $rows[0]['done']]);
        $this->assertNotNull($rows[0]['nextFree']);
        $this->assertSame([0, null], [$rows[1]['booked'], $rows[1]['nextFree']]);
        $this->assertSame([['id' => $bare->id, 'name' => 'Dr. Zain Ali']], $view['alerts']['doctorsWithoutHours']);
    }

    public function test_a_clinic_with_nothing_booked_yet_gets_zeros_and_empty_lists()
    {
        $view = $this->overview();

        $this->assertSame(['value' => 0, 'previous' => 0], $view['kpis']['booked']);
        $this->assertSame(0.0, $view['kpis']['cancellationRate']['value']);
        $this->assertSame(0.0, $view['kpis']['doctorTimeUsed']['value']);
        $this->assertSame([], $view['services']);
        $this->assertSame(['done' => 0, 'upcoming' => 0, 'cancelled' => 0, 'noShow' => 0], $view['outcomes']);
        $this->assertSame(0, $view['alerts']['failedMessages']);
    }
}
