<?php

namespace Tests\Feature\PatientLinks;

use App\Booking\BookingRequest;
use App\Booking\BookingService;
use App\Enums\AppointmentStatus;
use App\Enums\BookingSource;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\RescheduleRequest;
use App\Models\User;
use App\PatientLinks\PatientLinks;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** The doctor's side of reschedule requests (C4): what they see, and approving or rejecting. */
class RescheduleRequestsTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    private User $me;

    private Appointment $appointment;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        Carbon::setTestNow('2026-11-02 05:00:00');
        $this->clinic->forceFill(['settings' => ['rescheduleRequiresApproval' => true]])->save();

        $this->me = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor->forceFill(['user_id' => $this->me->id])->save();

        $this->appointment = $this->book('2026-11-04 10:00');
        $this->token = $this->inClinic(fn () => app(PatientLinks::class)->issue($this->appointment));
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function inClinic(callable $work): mixed
    {
        return app(TenantContext::class)->run($this->clinic, $work);
    }

    private function book(string $local, ?Patient $patient = null): Appointment
    {
        return $this->inClinic(fn () => app(BookingService::class)->book($this->clinic, $this->reception, new BookingRequest(
            ($patient ?? $this->patient)->id, $this->doctor->id, $this->service->id, $this->at($local), BookingSource::Manual, 'Check-up',
        )));
    }

    /** The patient asks, through their link, to move to a clinic-local time. */
    private function ask(string $local = '2026-11-05 11:00'): RescheduleRequest
    {
        $this->postJson("/p/{$this->token}/reschedule", ['startsAt' => $this->at($local)->format('Y-m-d\TH:i:s.v\Z')])->assertOk();

        return RescheduleRequest::query()->withoutGlobalScopes()->latest('id')->firstOrFail();
    }

    private function decide(RescheduleRequest|string $request, array $body, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->me)->patchJson('/doctor/requests/'.($request instanceof RescheduleRequest ? $request->id : $request), $body);
    }

    private function requestsPage(?User $as = null): array
    {
        return $this->actingAs($as ?? $this->me)->getJson('/doctor/requests')->assertOk()->json();
    }

    private function fresh(): Appointment
    {
        return $this->inClinic(fn () => Appointment::query()->findOrFail($this->appointment->id));
    }

    public function test_the_page_has_the_shape_the_screens_are_tested_with()
    {
        $this->ask();

        $this->assertSameShape($this->fixture('doctor-requests-filled-view'), $this->requestsPage());
    }

    public function test_the_page_lists_waiting_requests_with_their_visit_and_the_badge_and_overview_count_them()
    {
        $second = $this->book('2026-11-05 14:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']));
        $first = $this->ask();
        $token2 = $this->inClinic(fn () => app(PatientLinks::class)->issue($second));
        $this->postJson("/p/{$token2}/reschedule", ['startsAt' => $this->at('2026-11-06 14:00')->format('Y-m-d\TH:i:s.v\Z')])->assertOk();

        $view = $this->requestsPage();

        $this->assertCount(2, $view['pending']);
        $this->assertSame([], $view['history']);
        $this->assertSame($second->id, $view['pending'][0]['row']['appointment']['id'], 'newest first');
        $this->assertSame($first->id, $view['pending'][1]['request']['id']);
        $this->assertSame('pending', $view['pending'][1]['request']['status']);
        $this->assertSame('Ayesha Khan', $view['pending'][1]['row']['patient']['name']);
        $this->assertSame('2026-11-05T06:00:00.000Z', $view['pending'][1]['request']['proposedStartsAt']);
        $this->assertSame('2026-11-04T05:00:00.000Z', $view['pending'][1]['request']['fromStartsAt']);
        $this->assertSame(2, $this->actingAs($this->me)->getJson('/doctor/shell')->json('pendingRequests'));
        $this->assertSame(2, $this->actingAs($this->me)->getJson('/doctor')->json('pendingRequests'));
    }

    public function test_approving_moves_the_visit_and_records_the_decision()
    {
        $request = $this->ask();

        $this->decide($request, ['decision' => 'approved', 'message' => '  See you then  '])->assertOk()
            ->assertJson(['id' => $request->id, 'status' => 'approved', 'message' => 'See you then']);

        $moved = $this->fresh();
        $this->assertTrue($this->at('2026-11-05 11:00')->equalTo($moved->starts_at));
        $this->assertSame(AppointmentStatus::Booked, $moved->status);
        $this->assertSame(['approved', (string) $this->me->id], [$request->fresh()->status, $request->fresh()->decided_by]);
        $this->assertNotNull($request->fresh()->decided_at);

        $decided = DB::table('audit_logs')->where('action', 'request.decided')->first();
        $this->assertSame(['user', (string) $this->me->id, $this->appointment->id], [$decided->actor_type, $decided->actor_id, $decided->subject_id]);

        $view = $this->requestsPage();
        $this->assertSame([], $view['pending']);
        $this->assertSame('approved', $view['history'][0]['request']['status']);
        $this->assertSame(0, $this->actingAs($this->me)->getJson('/doctor/shell')->json('pendingRequests'));
        // The visit can be asked about again once the request is decided.
        $this->assertFalse($this->getJson("/p/{$this->token}")->json('pendingRequest'));
    }

    public function test_rejecting_keeps_the_visit_and_records_the_message()
    {
        $request = $this->ask();

        $this->decide($request, ['decision' => 'rejected', 'message' => 'Not possible that day'])->assertOk()->assertJson(['status' => 'rejected', 'message' => 'Not possible that day']);

        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($this->fresh()->starts_at));
        $this->assertSame('rejected', $this->requestsPage()['history'][0]['request']['status']);
        $this->assertNull($this->decide($this->ask('2026-11-06 11:00'), ['decision' => 'rejected'])->assertOk()->json('message'));
    }

    public function test_approving_a_time_that_has_gone_is_409_and_the_request_stays_waiting()
    {
        $request = $this->ask();
        $this->book('2026-11-05 11:00', Patient::factory()->forClinic($this->clinic)->create());

        $response = $this->decide($request, ['decision' => 'approved'])->assertStatus(409)->assertJson(['code' => 'SLOT_UNAVAILABLE']);

        $this->assertNotEmpty($response->json('alternatives'));
        $this->assertSame('pending', $request->fresh()->status);
        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($this->fresh()->starts_at));
        $this->assertCount(1, $this->requestsPage()['pending']);

        // Rejecting it is still possible.
        $this->decide($request, ['decision' => 'rejected'])->assertOk();
    }

    public function test_a_request_is_decided_once()
    {
        $request = $this->ask();

        $this->decide($request, ['decision' => 'rejected'])->assertOk();

        $this->decide($request, ['decision' => 'approved'])->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);
        $this->assertTrue($this->at('2026-11-04 10:00')->equalTo($this->fresh()->starts_at));
    }

    public function test_a_request_goes_stale_when_the_visit_is_cancelled_or_moved_by_someone_else()
    {
        $cancelled = $this->ask();
        $this->inClinic(fn () => app(BookingService::class)->cancel($this->fresh()));

        $this->assertSame([], $this->requestsPage()['pending']);
        $this->assertSame(0, $this->actingAs($this->me)->getJson('/doctor/shell')->json('pendingRequests'));
        $this->decide($cancelled, ['decision' => 'approved'])->assertStatus(422)->assertJson(['code' => 'INVALID_TRANSITION']);

        // Another visit, moved by reception after the patient asked.
        $other = $this->book('2026-11-06 10:00', Patient::factory()->forClinic($this->clinic)->create());
        $token = $this->inClinic(fn () => app(PatientLinks::class)->issue($other));
        $this->postJson("/p/{$token}/reschedule", ['startsAt' => $this->at('2026-11-09 10:00')->format('Y-m-d\TH:i:s.v\Z')])->assertOk();
        $moved = RescheduleRequest::query()->withoutGlobalScopes()->latest('id')->firstOrFail();
        $this->inClinic(fn () => app(BookingService::class)->reschedule($this->clinic, $this->reception, $other, $this->at('2026-11-06 11:00')));

        $this->assertSame([], $this->requestsPage()['pending']);
        $this->decide($moved, ['decision' => 'approved'])->assertStatus(422);
    }

    public function test_only_the_doctor_the_request_is_for_may_decide_it()
    {
        $request = $this->ask();
        $other = User::factory()->doctor()->forClinic($this->clinic)->create();
        Doctor::factory()->forClinic($this->clinic)->create(['user_id' => $other->id]);

        $this->decide($request, ['decision' => 'approved'], $other)->assertForbidden();
        $this->decide($request, ['decision' => 'approved'], $this->reception)->assertForbidden();
        $this->decide($request, ['decision' => 'approved'], $this->admin)->assertForbidden();
        $this->assertSame('pending', $request->fresh()->status);
        // They do not see it either.
        $this->assertSame([], $this->requestsPage($other)['pending']);
    }

    public function test_another_clinics_request_is_not_found_and_signed_out_is_refused()
    {
        $request = $this->ask();
        $other = Clinic::factory()->create();
        $stranger = User::factory()->doctor()->forClinic($other)->create();
        Doctor::factory()->forClinic($other)->create(['user_id' => $stranger->id]);

        $this->decide($request, ['decision' => 'approved'], $stranger)->assertNotFound();
        $this->assertSame([], $this->requestsPage($stranger)['pending']);

        $this->app['auth']->forgetGuards();
        $this->patchJson("/doctor/requests/{$request->id}", ['decision' => 'approved'])->assertUnauthorized();
    }

    public function test_the_decision_and_message_are_validated()
    {
        $request = $this->ask();

        $this->decide($request, [])->assertStatus(422)->assertJson(['field' => 'decision']);
        $this->decide($request, ['decision' => 'maybe'])->assertStatus(422)->assertJson(['field' => 'decision']);
        $this->decide($request, ['decision' => 'approved', 'message' => str_repeat('x', 501)])->assertStatus(422)->assertJson(['field' => 'message']);
        $this->decide('nothing', ['decision' => 'approved'])->assertNotFound();
        $this->assertSame('pending', $request->fresh()->status);
    }

    public function test_reception_sees_what_the_patient_did_and_that_it_was_the_patient()
    {
        $this->postJson("/p/{$this->token}/confirm")->assertOk();
        $this->ask();

        $view = $this->actingAs($this->reception)->getJson("/reception/appointments/{$this->appointment->id}")->assertOk()->json();

        // The two replies, then the confirmation message filed when the visit was booked (the patient has not consented, so it failed).
        $this->assertSame(['reply', 'reply', 'message'], array_column($view['timeline'], 'type'));
        $this->assertSame(['reschedule', 'confirm'], array_column(array_column(array_slice($view['timeline'], 0, 2), 'reply'), 'action'), 'newest first');
        $this->assertSame($this->appointment->id, $view['timeline'][0]['reply']['appointmentId']);
        $actors = collect($view['history'])->keyBy('action');
        $this->assertSame(['kind' => 'patient', 'name' => null], $actors['appointment.status_changed']['actor']);
        $this->assertSame(['kind' => 'patient', 'name' => null], $actors['request.created']['actor']);
    }
}
