<?php

namespace Tests\Feature\PatientLinks;

use App\Booking\BookingRequest;
use App\Booking\BookingService;
use App\Enums\AppointmentStatus;
use App\Enums\BookingSource;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\PatientLink;
use App\Models\PatientReply;
use App\Models\RescheduleRequest;
use App\Models\Service;
use App\Models\User;
use App\PatientLinks\Contracts\PatientLinkDelivery;
use App\PatientLinks\PatientLinks;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** The patient link pages (E1 to E4) and what a patient can do from them: the rules, the audit, isolation and the headers. */
class PatientLinkTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    private Appointment $appointment;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        $this->clinic->forceFill(['name' => 'Shifa Clinic', 'phone' => '+923001234567', 'address' => '12 Main Road, Lahore'])->save();
        // Monday 10:00 in the clinic; the visit is on Wednesday 10:00.
        Carbon::setTestNow('2026-11-02 05:00:00');
        RateLimiter::clear('patient-link');

        $this->appointment = $this->book('2026-11-04 10:00');
        $this->token = $this->linkFor($this->appointment);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function inClinic(callable $work, ?Clinic $clinic = null): mixed
    {
        return app(TenantContext::class)->run($clinic ?? $this->clinic, $work);
    }

    private function book(string $local, ?Patient $patient = null, ?Doctor $doctor = null, ?Clinic $clinic = null): Appointment
    {
        $clinic ??= $this->clinic;

        return $this->inClinic(fn () => app(BookingService::class)->book($clinic, $this->reception, new BookingRequest(
            ($patient ?? $this->patient)->id,
            ($doctor ?? $this->doctor)->id,
            $this->service->id,
            $this->at($local),
            BookingSource::Manual,
        )), $clinic);
    }

    private function linkFor(Appointment $appointment): string
    {
        return $this->inClinic(fn () => app(PatientLinks::class)->issue($appointment), Clinic::query()->withoutGlobalScopes()->find($appointment->clinic_id));
    }

    private function fresh(): Appointment
    {
        return $this->inClinic(fn () => Appointment::query()->findOrFail($this->appointment->id));
    }

    private function audits(): array
    {
        return DB::table('audit_logs')->where('subject_id', $this->appointment->id)->orderBy('id')->get(['action', 'actor_type', 'actor_id'])->map(fn ($r) => (array) $r)->all();
    }

    private function settings(array $changes): void
    {
        $this->clinic->forceFill(['settings' => [...($this->clinic->settings ?? []), ...$changes]])->save();
    }

    private function iso(string $local): string
    {
        return $this->at($local)->format('Y-m-d\TH:i:s.v\Z');
    }

    // The pages

    public function test_every_page_has_the_shape_the_screens_are_tested_with()
    {
        $this->assertSameShape($this->fixture('patient-manage-view'), $this->getJson("/p/{$this->token}")->assertOk()->json());
        $this->assertSameShape($this->fixture('patient-reschedule-view'), $this->getJson("/p/{$this->token}/reschedule")->assertOk()->json());
        $this->assertSameShape($this->fixture('patient-status-view'), $this->getJson("/p/{$this->token}/status")->assertOk()->json());
        $this->assertSameShape($this->fixture('patient-expired-view'), $this->getJson("/p/{$this->token}/expired")->assertOk()->json());
    }

    public function test_the_pages_without_a_json_request_are_the_pages_with_the_token()
    {
        foreach (['' => 'patient/manage', '/reschedule' => 'patient/reschedule', '/status' => 'patient/status', '/expired' => 'patient/expired'] as $suffix => $component) {
            $this->get("/p/{$this->token}{$suffix}")->assertOk()->assertInertia(fn ($page) => $page->component($component)->where('token', $this->token));
        }
    }

    public function test_the_manage_page_shows_only_what_that_one_appointment_needs()
    {
        $this->patient->forceFill(['name' => 'Ayesha Bibi Khan', 'phone' => '+923009998877'])->save();
        $stranger = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Zara Noor Secret', 'phone' => '+923001112223']);
        $this->book('2026-11-04 11:00', $stranger);

        $body = (string) $this->getJson("/p/{$this->token}")->assertOk()->getContent();
        $view = json_decode($body, true);

        $this->assertSame('Ayesha', $view['appointment']['firstName']);
        $this->assertSame(['name' => 'Shifa Clinic', 'phone' => '+923001234567', 'address' => '12 Main Road, Lahore', 'timezone' => 'Asia/Karachi'], $view['clinic']);
        $this->assertSame('Dr. Sana', $view['appointment']['doctorName']);
        $this->assertSame(['Bibi', 'Khan', '+923009998877', 'Zara', 'Secret', '+923001112223'], array_values(array_filter(
            ['Bibi', 'Khan', '+923009998877', 'Zara', 'Secret', '+923001112223'],
            fn (string $leak) => ! str_contains($body, $leak),
        )), 'nothing but the first name of this patient may appear');
        $this->assertSame(['confirm' => true, 'reschedule' => true, 'cancel' => true], $view['allowed']);
        $this->assertNull($view['late']);
        $this->assertSame(4, $view['cancellationWindowHours']);
        $this->assertFalse($view['pendingRequest']);
        $this->assertFalse($view['queueOpen']);
        $this->assertSame('2026-11-02', $view['today']);
    }

    public function test_the_token_is_stored_only_as_a_hash()
    {
        $link = PatientLink::query()->withoutGlobalScopes()->first();

        $this->assertSame(64, strlen($this->token));
        $this->assertSame(hash('sha256', $this->token), $link->token_hash);
        $this->assertNotSame($this->token, $link->token_hash);
        $this->assertSame([], DB::table('patient_links')->where('token_hash', $this->token)->get()->all());
    }

    // Expired links

    public function test_a_link_that_opens_nothing_reads_as_expired_and_names_no_clinic()
    {
        foreach (['/p/'.str_repeat('a', 64), '/p/short', '/p/'.str_repeat('z', 300)] as $url) {
            foreach (['', '/reschedule', '/status', '/expired'] as $suffix) {
                $this->getJson($url.$suffix)->assertOk()->assertExactJson(['state' => 'expired', 'clinic' => null]);
            }
        }
    }

    public function test_a_revoked_link_and_a_link_long_after_the_visit_read_as_expired_with_the_clinics_name()
    {
        $this->inClinic(fn () => app(PatientLinks::class)->revokeAll($this->appointment));
        $this->getJson("/p/{$this->token}")->assertOk()->assertExactJson(['state' => 'expired', 'clinic' => ['name' => 'Shifa Clinic', 'phone' => '+923001234567']]);

        $second = $this->linkFor($this->appointment);
        $this->getJson("/p/{$second}")->assertOk()->assertJsonPath('state', 'valid');

        // The visit ended Wednesday 10:30 clinic time: still open for 24 hours, then expired.
        Carbon::setTestNow('2026-11-05 05:00:00');
        $this->getJson("/p/{$second}")->assertOk()->assertJsonPath('state', 'valid');
        Carbon::setTestNow('2026-11-05 05:31:00');
        $this->getJson("/p/{$second}")->assertOk()->assertJsonPath('state', 'expired');
    }

    public function test_every_action_on_a_dead_link_is_410_link_expired()
    {
        $this->inClinic(fn () => app(PatientLinks::class)->revokeAll($this->appointment));

        foreach (['confirm', 'cancel'] as $action) {
            $this->postJson("/p/{$this->token}/{$action}")->assertStatus(410)->assertJson(['code' => 'LINK_EXPIRED']);
            $this->postJson('/p/'.str_repeat('a', 64)."/{$action}")->assertStatus(410)->assertJson(['code' => 'LINK_EXPIRED']);
        }

        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-05 10:00')])->assertStatus(410);
        $this->assertSame(AppointmentStatus::Booked, $this->fresh()->status);
    }

    // The rules

    public function test_the_cancellation_window_makes_a_visit_late_and_the_start_ends_everything()
    {
        // 07:00 local: three hours before a 10:00 visit, inside the four hour window.
        Carbon::setTestNow('2026-11-04 02:00:00');
        $view = $this->getJson("/p/{$this->token}")->assertOk()->json();

        $this->assertSame(['confirm' => true, 'reschedule' => false, 'cancel' => false], $view['allowed']);
        $this->assertSame($this->iso('2026-11-04 06:00'), $view['late']['deadline']);
        $this->assertTrue($view['queueOpen']);

        // After the start: nothing is allowed.
        Carbon::setTestNow('2026-11-04 05:10:00');
        $this->assertSame(['confirm' => false, 'reschedule' => false, 'cancel' => false], $this->getJson("/p/{$this->token}")->json('allowed'));
    }

    public function test_with_no_window_a_visit_can_be_changed_right_up_to_its_start()
    {
        $this->settings(['cancellationWindowHours' => null]);
        Carbon::setTestNow('2026-11-04 04:50:00');

        $view = $this->getJson("/p/{$this->token}")->assertOk()->json();

        $this->assertSame(['confirm' => true, 'reschedule' => true, 'cancel' => true], $view['allowed']);
        $this->assertNull($view['late']);
        $this->assertNull($view['cancellationWindowHours']);

        Carbon::setTestNow('2026-11-04 05:00:00');
        $this->assertFalse($this->getJson("/p/{$this->token}")->json('allowed.cancel'));
    }

    // Confirm

    public function test_confirming_confirms_once_and_repeating_it_is_harmless()
    {
        $this->postJson("/p/{$this->token}/confirm")->assertOk()->assertExactJson(['status' => 'confirmed']);
        $this->postJson("/p/{$this->token}/confirm")->assertOk()->assertExactJson(['status' => 'confirmed']);

        $this->assertSame(AppointmentStatus::Confirmed, $this->fresh()->status);
        $this->assertSame(['confirm'], PatientReply::query()->withoutGlobalScopes()->pluck('action')->all());
        $this->assertSame(['appointment.created', 'appointment.status_changed'], array_column($this->audits(), 'action'));
        $this->assertSame(['patient', null], [$this->audits()[1]['actor_type'], $this->audits()[1]['actor_id']]);
    }

    public function test_a_visit_that_has_started_or_ended_cannot_be_confirmed()
    {
        Carbon::setTestNow('2026-11-04 05:10:00');
        $this->postJson("/p/{$this->token}/confirm")->assertForbidden()->assertJson(['code' => 'OUTSIDE_WINDOW']);

        Carbon::setTestNow('2026-11-02 05:00:00');
        $this->inClinic(fn () => app(BookingService::class)->cancel($this->fresh()));
        $this->postJson("/p/{$this->token}/confirm")->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);
    }

    // Cancel

    public function test_cancelling_frees_the_time_and_is_recorded_as_the_patient()
    {
        $this->postJson("/p/{$this->token}/cancel")->assertOk()->assertExactJson(['status' => 'cancelled']);

        $this->assertSame(AppointmentStatus::Cancelled, $this->fresh()->status);
        $this->assertSame(0, DB::table('appointment_slots')->where('appointment_id', $this->appointment->id)->count());
        $this->assertSame(['cancel'], PatientReply::query()->withoutGlobalScopes()->pluck('action')->all());
        $last = array_values(array_filter($this->audits(), fn ($a) => $a['action'] === 'appointment.cancelled'))[0];
        $this->assertSame('patient', $last['actor_type']);

        // The same time can be booked by someone else straight away.
        $this->book('2026-11-04 10:00', Patient::factory()->forClinic($this->clinic)->create());
        $this->postJson("/p/{$this->token}/cancel")->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);
    }

    public function test_cancelling_inside_the_window_is_refused()
    {
        Carbon::setTestNow('2026-11-04 02:00:00');

        $this->postJson("/p/{$this->token}/cancel")->assertForbidden()->assertJson(['code' => 'OUTSIDE_WINDOW']);

        $this->assertSame(AppointmentStatus::Booked, $this->fresh()->status);
        $this->assertSame(0, PatientReply::query()->withoutGlobalScopes()->count());
    }

    // Reschedule

    public function test_the_reschedule_page_offers_fourteen_days_of_free_future_times_but_not_the_visits_own()
    {
        $this->book('2026-11-03 10:00', Patient::factory()->forClinic($this->clinic)->create());
        $view = $this->getJson("/p/{$this->token}/reschedule")->assertOk()->json();
        $days = collect($view['days'])->keyBy('date');

        $this->assertCount(14, $view['days']);
        $this->assertSame('2026-11-02', $view['days'][0]['date']);
        $this->assertSame('2026-11-15', $view['days'][13]['date']);
        $this->assertFalse($view['needsApproval']);
        // Sunday: the doctor does not work.
        $this->assertTrue($days['2026-11-08']['closed']);
        $this->assertSame([], $days['2026-11-08']['slots']);
        // A working day: free times in order, none in the past, none already booked.
        $this->assertFalse($days['2026-11-03']['closed']);
        $this->assertNotContains($this->iso('2026-11-03 10:00'), $days['2026-11-03']['slots']);
        $this->assertContains($this->iso('2026-11-03 11:00'), $days['2026-11-03']['slots']);
        $this->assertSame($days['2026-11-03']['slots'], collect($days['2026-11-03']['slots'])->sort()->values()->all());
        // The visit's own time is not offered, other times that day are.
        $this->assertNotContains($this->iso('2026-11-04 10:00'), $days['2026-11-04']['slots']);
        $this->assertContains($this->iso('2026-11-04 11:00'), $days['2026-11-04']['slots']);
        // Today at 10:00 local has already begun.
        $this->assertNotContains($this->iso('2026-11-02 09:30'), $days['2026-11-02']['slots']);
    }

    public function test_a_holiday_and_leave_close_a_day_and_a_visit_that_cannot_be_changed_has_no_days()
    {
        $this->inClinic(fn () => (new ClinicHoliday)->forceFill(['date' => '2026-11-03', 'name' => 'Holiday'])->save());
        $this->workWeekdays($this->doctor, [], [['id' => null, 'startDate' => '2026-11-05', 'endDate' => '2026-11-05', 'reason' => 'Away']]);

        $days = collect($this->getJson("/p/{$this->token}/reschedule")->json('days'))->keyBy('date');
        $this->assertTrue($days['2026-11-03']['closed']);
        $this->assertTrue($days['2026-11-05']['closed']);
        $this->assertFalse($days['2026-11-06']['closed']);

        Carbon::setTestNow('2026-11-04 02:00:00');
        $this->assertSame([], $this->getJson("/p/{$this->token}/reschedule")->json('days'));
    }

    public function test_moving_a_visit_moves_it_at_once_and_it_goes_back_to_booked()
    {
        $this->postJson("/p/{$this->token}/confirm")->assertOk();

        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-05 11:00')])
            ->assertOk()->assertExactJson(['result' => 'moved', 'startsAt' => $this->iso('2026-11-05 11:00')]);

        $moved = $this->fresh();
        $this->assertTrue($this->at('2026-11-05 11:00')->equalTo($moved->starts_at));
        $this->assertSame(AppointmentStatus::Booked, $moved->status);
        $this->assertSame(['confirm', 'reschedule'], PatientReply::query()->withoutGlobalScopes()->orderBy('id')->pluck('action')->all());
        $rescheduled = array_values(array_filter($this->audits(), fn ($a) => $a['action'] === 'appointment.rescheduled'))[0];
        $this->assertSame('patient', $rescheduled['actor_type']);
        // Its old time is free for someone else, its new time is taken.
        $this->book('2026-11-04 10:00', Patient::factory()->forClinic($this->clinic)->create());
    }

    public function test_when_the_clinic_approves_changes_a_choice_becomes_a_request_and_the_visit_stays()
    {
        $this->settings(['rescheduleRequiresApproval' => true]);
        $this->assertTrue($this->getJson("/p/{$this->token}/reschedule")->json('needsApproval'));

        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-05 11:00')])
            ->assertOk()->assertExactJson(['result' => 'requested', 'startsAt' => $this->iso('2026-11-05 11:00')]);

        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($this->fresh()->starts_at));
        $request = RescheduleRequest::query()->withoutGlobalScopes()->sole();
        $this->assertSame(['pending', $this->doctor->id, $this->patient->id], [$request->status, $request->doctor_id, $request->patient_id]);
        $this->assertTrue($this->at('2026-11-05 11:00')->equalTo($request->proposed_starts_at));
        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($request->from_starts_at));
        $this->assertSame(['reschedule'], PatientReply::query()->withoutGlobalScopes()->pluck('action')->all());

        // The page now says it is waiting, and a second request is refused.
        $view = $this->getJson("/p/{$this->token}")->json();
        $this->assertTrue($view['pendingRequest']);
        $this->assertFalse($view['allowed']['reschedule']);
        $this->assertTrue($view['allowed']['cancel']);
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-06 11:00')])->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);
        $this->assertSame([], $this->getJson("/p/{$this->token}/reschedule")->json('days'));
    }

    public function test_a_time_that_was_just_taken_is_409_with_the_nearest_alternatives()
    {
        $this->book('2026-11-05 11:00', Patient::factory()->forClinic($this->clinic)->create());

        $response = $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-05 11:00')])
            ->assertStatus(409)->assertJson(['code' => 'SLOT_UNAVAILABLE']);

        $this->assertNotEmpty($response->json('alternatives'));
        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($this->fresh()->starts_at));
    }

    public function test_a_bad_choice_of_time_is_refused_on_the_field()
    {
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-20 11:00')])->assertStatus(422)->assertJson(['code' => 'VALIDATION', 'field' => 'startsAt']);
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-01 11:00')])->assertStatus(422)->assertJson(['field' => 'startsAt']);
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-04 10:00')])->assertStatus(422)->assertJson(['field' => 'startsAt']);
        $this->postJson("/p/{$this->token}/reschedule", [])->assertStatus(422)->assertJson(['field' => 'startsAt']);
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-08 11:00')])->assertStatus(409);
    }

    public function test_moving_inside_the_window_is_refused()
    {
        Carbon::setTestNow('2026-11-04 02:00:00');

        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->iso('2026-11-05 11:00')])->assertForbidden()->assertJson(['code' => 'OUTSIDE_WINDOW']);
    }

    // The queue

    public function test_the_queue_page_follows_the_day()
    {
        $stage = fn () => $this->getJson("/p/{$this->token}/status")->assertOk()->json();

        $this->assertSame('notToday', $stage()['stage']);

        Carbon::setTestNow('2026-11-04 03:00:00');
        $this->assertSame('notYet', $stage()['stage']);

        $this->inClinic(fn () => app(BookingService::class)->setStatus($this->fresh(), AppointmentStatus::Arrived));
        $alone = $stage();
        $this->assertSame(['next', 0, 0], [$alone['stage'], $alone['ahead'], $alone['waitMin']]);

        // Two patients checked in before this one: one waiting for the doctor, one with them.
        $earlier = $this->book('2026-11-04 09:00', Patient::factory()->forClinic($this->clinic)->create());
        $consulting = $this->book('2026-11-04 12:00', Patient::factory()->forClinic($this->clinic)->create());
        $this->inClinic(fn () => app(BookingService::class)->setStatus($earlier, AppointmentStatus::Arrived));
        $this->inClinic(fn () => app(BookingService::class)->setStatus($consulting, AppointmentStatus::InConsultation));
        $waiting = $stage();
        // 30 minutes each, rounded up to 5.
        $this->assertSame(['waiting', 2, 60], [$waiting['stage'], $waiting['ahead'], $waiting['waitMin']]);

        $this->inClinic(fn () => app(BookingService::class)->setStatus($this->fresh(), AppointmentStatus::InConsultation));
        $this->assertSame('consult', $stage()['stage']);
        $this->inClinic(fn () => app(BookingService::class)->setStatus($this->fresh(), AppointmentStatus::Done));
        $this->assertSame('done', $stage()['stage']);
    }

    public function test_a_cancelled_or_missed_visit_has_an_ended_queue_page()
    {
        Carbon::setTestNow('2026-11-04 03:00:00');
        $this->inClinic(fn () => app(BookingService::class)->cancel($this->fresh()));

        $this->assertSame('ended', $this->getJson("/p/{$this->token}/status")->json('stage'));
        $this->assertFalse($this->getJson("/p/{$this->token}")->json('queueOpen'));
    }

    // A new link

    public function test_asking_for_a_new_link_gets_the_same_answer_for_any_token_and_issues_one_for_a_real_visit()
    {
        $sent = [];
        $this->app->instance(PatientLinkDelivery::class, new class($sent) implements PatientLinkDelivery
        {
            /** @param array<int, string> $sent */
            public function __construct(public array &$sent) {}

            public function deliver(Appointment $appointment, string $url): void
            {
                $this->sent[] = $appointment->id.' '.$url;
            }
        });

        $this->postJson("/p/{$this->token}/request-link")->assertOk()->assertExactJson(['ok' => true]);
        $this->postJson('/p/'.str_repeat('b', 64).'/request-link')->assertOk()->assertExactJson(['ok' => true]);

        $this->assertCount(1, $sent);
        $this->assertStringStartsWith($this->appointment->id.' '.url('/p/'), $sent[0]);
        $this->assertSame(2, PatientLink::query()->withoutGlobalScopes()->count());

        // The new link works.
        $new = substr($sent[0], strrpos($sent[0], '/') + 1);
        $this->getJson("/p/{$new}")->assertOk()->assertJsonPath('state', 'valid');
    }

    public function test_no_new_link_is_issued_long_after_the_visit()
    {
        Carbon::setTestNow('2026-11-10 05:00:00');

        $this->postJson("/p/{$this->token}/request-link")->assertOk();

        $this->assertSame(1, PatientLink::query()->withoutGlobalScopes()->count());
    }

    public function test_asking_for_a_new_link_is_slowed_down()
    {
        RateLimiter::clear('patient-link-request');

        foreach (range(1, 3) as $i) {
            $this->postJson("/p/{$this->token}/request-link")->assertOk();
        }

        $this->postJson("/p/{$this->token}/request-link")->assertStatus(429)->assertJson(['code' => 'RATE_LIMITED']);
        // Another link is its own allowance.
        $this->postJson('/p/'.str_repeat('c', 64).'/request-link')->assertOk();
    }

    // Safety

    public function test_the_pages_and_actions_are_not_indexed_cached_or_passed_on()
    {
        foreach ([$this->getJson("/p/{$this->token}"), $this->get("/p/{$this->token}"), $this->postJson("/p/{$this->token}/confirm"), $this->getJson('/p/nothing')] as $response) {
            $this->assertSame('noindex, nofollow', $response->headers->get('X-Robots-Tag'));
            $this->assertSame('no-referrer', $response->headers->get('Referrer-Policy'));
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }
    }

    public function test_the_pages_are_slowed_down_per_address()
    {
        RateLimiter::clear('patient-link');

        foreach (range(1, 60) as $i) {
            $this->getJson('/p/'.str_repeat('d', 64))->assertOk();
        }

        $this->getJson('/p/'.str_repeat('d', 64))->assertStatus(429);
    }

    public function test_a_link_opens_its_own_appointment_in_its_own_clinic_and_nothing_else()
    {
        $other = Clinic::factory()->create(['country' => 'PK', 'timezone' => 'Asia/Karachi', 'name' => 'Other Clinic']);
        $otherDoctor = Doctor::factory()->forClinic($other)->create(['display_name' => 'Dr. Other']);
        $otherService = Service::factory()->forClinic($other)->create(['name' => 'Other service', 'duration_minutes' => 30, 'buffer_minutes' => 0]);
        $otherDoctor->services()->sync([$otherService->id]);
        $this->workWeekdays($otherDoctor);
        $otherPatient = Patient::factory()->forClinic($other)->create(['name' => 'Omar Other']);
        $theirs = $this->inClinic(fn () => app(BookingService::class)->book($other, User::factory()->receptionist()->forClinic($other)->create(), new BookingRequest(
            $otherPatient->id, $otherDoctor->id, $otherService->id, $this->at('2026-11-04 10:00'), BookingSource::Manual,
        )), $other);
        $theirToken = $this->linkFor($theirs);

        $mine = $this->getJson("/p/{$this->token}")->json();
        $their = $this->getJson("/p/{$theirToken}")->json();

        $this->assertSame(['Shifa Clinic', 'Dr. Sana', 'Ayesha'], [$mine['clinic']['name'], $mine['appointment']['doctorName'], $mine['appointment']['firstName']]);
        $this->assertSame(['Other Clinic', 'Dr. Other', 'Omar'], [$their['clinic']['name'], $their['appointment']['doctorName'], $their['appointment']['firstName']]);

        // Acting on one never touches the other.
        $this->postJson("/p/{$theirToken}/cancel")->assertOk();
        $this->assertSame(AppointmentStatus::Booked, $this->fresh()->status);
    }

    public function test_acting_through_a_link_leaves_no_clinic_selected_for_the_next_request()
    {
        $this->postJson("/p/{$this->token}/confirm")->assertOk();

        $this->assertNull(app(TenantContext::class)->id());
    }
}
