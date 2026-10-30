<?php

namespace Tests\Feature\Booking;

use App\Booking\BookingService;
use App\Booking\Contracts\SlotHolds;
use App\Booking\SlotService;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function book(string $local = '2026-11-02 10:00', array $overrides = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->postJson(route('api.appointments.store'), [
            'patientId' => $this->patient->id,
            'doctorId' => $this->doctor->id,
            'serviceId' => $this->service->id,
            'startsAt' => $this->at($local)->toIso8601String(),
            'source' => 'manual',
            ...$overrides,
        ]);
    }

    private function freeTimes(string $date = '2026-11-02', ?User $as = null): array
    {
        return array_map(
            fn ($s) => Carbon::parse($s['startsAt'])->setTimezone('Asia/Karachi')->format('H:i'),
            $this->actingAs($as ?? $this->reception)->getJson(route('api.availability', ['doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'date' => $date]))->assertOk()->json(),
        );
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    private function cellsOf(string $appointmentId): int
    {
        return DB::table('appointment_slots')->where('appointment_id', $appointmentId)->count();
    }

    // Booking

    public function test_a_free_slot_is_booked_and_the_doctors_time_is_taken_with_its_buffer()
    {
        $made = $this->book('2026-11-02 10:00', ['reason' => 'Check-up'])->assertCreated()
            ->assertJson(['status' => 'booked', 'source' => 'manual', 'reason' => 'Check-up', 'startsAt' => '2026-11-02T05:00:00.000Z', 'endsAt' => '2026-11-02T05:30:00.000Z', 'createdBy' => (string) $this->reception->id])->json();

        $this->assertSameShape($this->fixture('appointment'), $made);
        $this->assertSame($this->patient->id, $made['patientId']);
        $this->assertSame(8, $this->cellsOf($made['id']), '30 minutes plus a 10-minute buffer in 5-minute cells');
        $this->assertSame(['appointment.created'], $this->actions());
        $this->assertSame(['source' => 'manual'], json_decode(DB::table('audit_logs')->value('meta'), true));
    }

    public function test_reason_and_notes_are_encrypted_at_rest_and_read_back_plainly()
    {
        $id = $this->book('2026-11-02 10:00', ['reason' => 'Persistent cough', 'notes' => 'Bring old reports'])->assertCreated()->json('id');

        $row = DB::table('appointments')->where('id', $id)->first();
        $this->assertStringNotContainsString('cough', (string) $row->reason);
        $this->assertStringNotContainsString('reports', (string) $row->notes);
        $this->actingAs($this->reception)->getJson(route('api.appointments.show', $id))->assertJson(['reason' => 'Persistent cough', 'notes' => 'Bring old reports']);
    }

    public function test_the_source_defaults_to_manual_and_a_reviewed_voice_booking_is_accepted_but_a_patient_link_is_not()
    {
        $this->book('2026-11-02 09:00', ['source' => null])->assertCreated()->assertJson(['source' => 'manual']);
        $this->book('2026-11-02 11:00', ['source' => 'voice'])->assertCreated()->assertJson(['source' => 'voice']);
        $this->book('2026-11-02 12:00', ['source' => 'patient_link'])->assertStatus(422)->assertJsonPath('field', 'source');
    }

    public function test_a_booked_time_disappears_from_availability_and_its_neighbours_follow_the_buffer()
    {
        $this->assertContains('10:00', $this->freeTimes());

        $this->book('2026-11-02 10:00')->assertCreated();

        $times = $this->freeTimes();
        $this->assertNotContains('09:30', $times);
        $this->assertNotContains('10:00', $times);
        $this->assertNotContains('10:30', $times);
        $this->assertContains('09:00', $times);
        $this->assertContains('11:00', $times);
        $this->assertContains('11:00', $this->freeTimes(as: $this->admin), 'everyone sees the same');
    }

    public function test_the_same_slot_cannot_be_booked_twice_and_the_refusal_offers_alternatives()
    {
        $this->book('2026-11-02 10:00')->assertCreated();

        $refused = $this->book('2026-11-02 10:00')->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');

        $alternatives = $refused->json('alternatives');
        $this->assertCount(3, $alternatives);
        $this->assertSameShape($this->fixture('slot'), $alternatives[0]);
        $this->assertSame(1, Appointment::query()->count());
        $this->assertSame(['appointment.created'], $this->actions());
    }

    public function test_an_overlapping_time_is_refused_even_when_it_starts_off_the_other_ones_start()
    {
        $this->book('2026-11-02 10:00')->assertCreated();

        $this->book('2026-11-02 09:30')->assertStatus(409);
        $this->book('2026-11-02 10:30')->assertStatus(409);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function unbookableTimes(): array
    {
        return [
            'off the service-length steps' => ['2026-11-02 10:10'],
            'before the clinic opens' => ['2026-11-02 08:00'],
            'when it would run past closing' => ['2026-11-02 16:45'],
            'in the past' => ['2026-11-01 11:00'],
            'on a day the doctor is off' => ['2026-11-07 10:00'],
            'on a day the clinic is closed' => ['2026-11-08 10:00'],
        ];
    }

    #[DataProvider('unbookableTimes')]
    public function test_a_time_that_is_not_offered_is_refused_with_alternatives(string $local)
    {
        $this->book($local)->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE')->assertJsonCount(3, 'alternatives');

        $this->assertSame(0, Appointment::query()->count());
    }

    public function test_a_clinic_holiday_and_a_doctors_leave_cannot_be_booked()
    {
        app(TenantContext::class)->run($this->clinic, fn () => (new ClinicHoliday)->forceFill(['date' => '2026-11-02', 'name' => 'Holiday'])->save());
        $this->workWeekdays($this->doctor, [], [['id' => null, 'startDate' => '2026-11-03', 'endDate' => '2026-11-03', 'reason' => '']]);

        $this->book('2026-11-02 10:00')->assertStatus(409);
        $this->book('2026-11-03 10:00')->assertStatus(409);
        $this->book('2026-11-04 10:00')->assertCreated();
    }

    public function test_a_slot_someone_else_is_holding_cannot_be_booked_but_the_holders_own_can()
    {
        $this->actingAs($this->reception)->postJson(route('api.holds.store'), ['doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $this->at('2026-11-02 10:00')->toIso8601String()])->assertCreated();

        $this->book('2026-11-02 10:00', [], $this->admin)->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');
        $this->book('2026-11-02 10:00', [], $this->reception)->assertCreated();
    }

    public function test_booking_releases_the_bookers_hold()
    {
        $this->actingAs($this->reception)->postJson(route('api.holds.store'), ['doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $this->at('2026-11-02 10:00')->toIso8601String()])->assertCreated();

        $this->book('2026-11-02 10:00')->assertCreated();

        $this->assertSame([], app(SlotHolds::class)->active($this->clinic));
    }

    public function test_a_walk_in_starts_arrived_never_refuses_a_busy_or_past_time_and_takes_no_cells()
    {
        $busy = $this->book('2026-11-02 10:00')->assertCreated()->json('id');
        $before = DB::table('appointment_slots')->count();

        $walkIn = $this->book('2026-11-02 10:00', ['source' => 'walk_in'])->assertCreated()->assertJson(['status' => 'arrived', 'source' => 'walk_in'])->json();
        $this->book('2026-10-30 09:00', ['source' => 'walk_in'])->assertCreated()->assertJson(['status' => 'arrived']);

        $this->assertSame($before, DB::table('appointment_slots')->count(), 'walk-ins own no cells');
        $this->assertSame(0, $this->cellsOf($walkIn['id']));
        $this->assertSame(8, $this->cellsOf($busy));
        $this->assertNotContains('10:00', $this->freeTimes());
    }

    public function test_a_walk_in_still_needs_a_doctor_who_is_taking_bookings_and_offers_the_service()
    {
        $this->doctor->forceFill(['is_active' => false])->save();

        $this->book('2026-11-02 10:00', ['source' => 'walk_in'])->assertStatus(422)->assertJsonPath('field', 'doctorId');
    }

    public function test_bad_input_is_refused_on_its_field()
    {
        foreach (['patientId', 'doctorId', 'serviceId', 'startsAt'] as $field) {
            $this->book('2026-11-02 10:00', [$field => null])->assertStatus(422)->assertJsonPath('field', $field);
        }

        $this->book('2026-11-02 10:00', ['startsAt' => 'not a time'])->assertStatus(422)->assertJsonPath('field', 'startsAt');
        $this->book('2026-11-02 10:00', ['reason' => str_repeat('a', 501)])->assertStatus(422)->assertJsonPath('field', 'reason');
        $this->assertSame(0, Appointment::query()->count());
    }

    public function test_an_unknown_inactive_or_unoffered_target_is_refused()
    {
        $this->book('2026-11-02 10:00', ['patientId' => '01JNOSUCHPATIENT0000000000'])->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
        $this->book('2026-11-02 10:00', ['doctorId' => '01JNOSUCHDOCTOR000000000'])->assertNotFound();
        $this->book('2026-11-02 10:00', ['serviceId' => '01JNOSUCHSERVICE00000000'])->assertNotFound();

        $this->service->forceFill(['is_active' => false])->save();
        $this->book()->assertStatus(422)->assertJsonPath('field', 'serviceId');
        $this->service->forceFill(['is_active' => true])->save();

        $this->doctor->services()->sync([]);
        $this->book()->assertStatus(422)->assertJsonPath('field', 'serviceId');
        $this->doctor->services()->sync([$this->service->id]);

        $this->doctor->forceFill(['is_active' => false])->save();
        $this->book()->assertStatus(422)->assertJsonPath('field', 'doctorId');
        $this->assertSame(0, Appointment::query()->count());
    }

    public function test_another_clinics_patient_doctor_or_service_cannot_be_used()
    {
        $other = Clinic::factory()->create();
        $foreignPatient = Patient::factory()->forClinic($other)->create();
        $foreignDoctor = Doctor::factory()->forClinic($other)->create();
        $foreignService = Service::factory()->forClinic($other)->create();

        $this->book('2026-11-02 10:00', ['patientId' => $foreignPatient->id])->assertNotFound();
        $this->book('2026-11-02 10:00', ['doctorId' => $foreignDoctor->id])->assertNotFound();
        $this->book('2026-11-02 10:00', ['serviceId' => $foreignService->id])->assertNotFound();
    }

    public function test_the_database_guard_refuses_an_overlap_even_if_the_check_is_stale_and_leaves_nothing_behind()
    {
        $first = $this->book('2026-11-02 10:00')->assertCreated()->json('id');

        // A check that wrongly says "free" (two bookings at the same instant would both have passed it).
        $stale = new class(app(SlotHolds::class)) extends SlotService
        {
            public function assertBookable(Clinic $clinic, Doctor $doctor, Service $service, CarbonImmutable $startsAt, ?string $ignoreAppointmentId = null, ?User $viewer = null): void {}
        };
        $this->app->instance(SlotService::class, $stale);
        $this->app->forgetInstance(BookingService::class);

        $this->book('2026-11-02 10:00')->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');
        $this->book('2026-11-02 10:30')->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');

        $this->assertSame(1, Appointment::query()->count(), 'the refused booking rolled back completely');
        $this->assertSame(8, DB::table('appointment_slots')->count());
        $this->assertSame(8, $this->cellsOf($first));
        $this->assertSame(['appointment.created'], $this->actions(), 'no entry for a booking that did not happen');
    }

    public function test_the_database_itself_refuses_two_appointments_on_one_cell()
    {
        $this->book('2026-11-02 10:00')->assertCreated();

        $this->expectException(UniqueConstraintViolationException::class);

        DB::table('appointment_slots')->insert(['appointment_id' => Appointment::query()->value('id'), 'doctor_id' => $this->doctor->id, 'cell_start' => '2026-11-02 05:00:00']);
    }

    // Rescheduling

    public function test_an_appointment_is_moved_to_another_bookable_time_and_goes_back_to_booked()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'confirmed'])->assertOk();
        DB::table('audit_logs')->delete();

        $moved = $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-03 14:00')->toIso8601String()])
            ->assertOk()->assertJson(['status' => 'booked', 'startsAt' => '2026-11-03T09:00:00.000Z', 'endsAt' => '2026-11-03T09:30:00.000Z'])->json();

        $this->assertSame($id, $moved['id']);
        $this->assertSame(8, $this->cellsOf($id));
        $this->assertContains('10:00', $this->freeTimes(), 'the old time is free again');
        $this->assertNotContains('14:00', $this->freeTimes('2026-11-03'));
        $this->assertSame(['appointment.rescheduled'], $this->actions());
        $this->assertSame(['from' => '2026-11-02T05:00:00.000Z', 'to' => '2026-11-03T09:00:00.000Z'], json_decode(DB::table('audit_logs')->value('meta'), true));
    }

    public function test_an_appointment_may_move_to_a_time_that_overlaps_its_own_old_one()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-02 10:30')->toIso8601String()])->assertOk();

        $this->assertSame(8, $this->cellsOf($id));
        $this->assertSame(1, Appointment::query()->count());
    }

    public function test_moving_to_a_taken_time_is_refused_and_changes_nothing()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->book('2026-11-02 14:00')->assertCreated();

        $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-02 14:00')->toIso8601String()])
            ->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE')->assertJsonCount(3, 'alternatives');

        $this->assertSame('2026-11-02T05:00:00.000Z', $this->actingAs($this->reception)->getJson(route('api.appointments.show', $id))->json('startsAt'));
        $this->assertSame(8, $this->cellsOf($id));
    }

    public function test_only_booked_or_confirmed_appointments_can_be_moved()
    {
        foreach (['arrived', 'in_consultation', 'done', 'no_show'] as $status) {
            $id = $this->book(sprintf('2026-11-0%d 10:00', 3 + array_search($status, ['arrived', 'in_consultation', 'done', 'no_show'], true)))->json('id');
            $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => $status])->assertOk();

            $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-02 15:00')->toIso8601String()])
                ->assertStatus(422)->assertJsonPath('code', 'INVALID_TRANSITION');
        }
    }

    // Cancelling and the day

    public function test_cancelling_frees_the_time_at_once_for_someone_else()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $id))->assertOk()->assertJson(['status' => 'cancelled']);

        $this->assertSame(0, $this->cellsOf($id));
        $this->assertContains('10:00', $this->freeTimes());
        $this->book('2026-11-02 10:00')->assertCreated();
        $this->assertContains('appointment.cancelled', $this->actions());
    }

    public function test_an_appointment_cannot_be_cancelled_twice_or_once_in_consultation_or_done()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $id))->assertOk();
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $id))->assertStatus(422)->assertJsonPath('code', 'INVALID_TRANSITION');

        $busy = $this->book('2026-11-02 11:00')->json('id');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $busy), ['status' => 'in_consultation'])->assertOk();
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $busy))->assertStatus(422);
    }

    public function test_an_appointment_goes_through_its_day_and_gives_the_doctors_time_back_when_finished()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        foreach (['confirmed', 'arrived', 'in_consultation'] as $status) {
            $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => $status])->assertOk()->assertJson(['status' => $status]);
            $this->assertSame(8, $this->cellsOf($id), "still takes the doctor's time while $status");
        }

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'done'])->assertOk()->assertJson(['status' => 'done']);
        $this->assertSame(0, $this->cellsOf($id));
        $this->assertSame(['appointment.created', 'appointment.status_changed', 'appointment.status_changed', 'appointment.status_changed', 'appointment.status_changed'], $this->actions());
        $this->assertSame(['status' => 'done', 'from' => 'in_consultation'], json_decode(DB::table('audit_logs')->orderByDesc('id')->value('meta'), true));
    }

    public function test_a_no_show_frees_the_time()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'no_show'])->assertOk();

        $this->assertSame(0, $this->cellsOf($id));
        $this->assertContains('10:00', $this->freeTimes());
    }

    public function test_a_move_the_table_does_not_allow_is_refused()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'done'])->assertOk();

        foreach (['booked', 'confirmed', 'arrived', 'in_consultation', 'no_show', 'cancelled'] as $status) {
            $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => $status])->assertStatus(422)->assertJsonPath('code', 'INVALID_TRANSITION');
        }

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'sleeping'])->assertStatus(422)->assertJsonPath('field', 'status');
    }

    public function test_cancelling_through_the_status_route_is_a_cancellation()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'cancelled'])->assertOk()->assertJson(['status' => 'cancelled']);

        $this->assertSame(0, $this->cellsOf($id));
        $this->assertContains('appointment.cancelled', $this->actions());
    }

    // Undo

    public function test_a_stage_can_be_undone_on_the_day_and_not_on_another()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'arrived'])->assertOk();

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['undo' => true])->assertStatus(422)->assertJsonPath('code', 'INVALID_TRANSITION');

        Carbon::setTestNow($this->at('2026-11-02 10:05'));
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['undo' => true])->assertOk()->assertJson(['status' => 'confirmed']);
        $this->assertContains('appointment.status_reverted', $this->actions());
        $this->assertSame(['status' => 'confirmed', 'from' => 'arrived'], json_decode(DB::table('audit_logs')->where('action', 'appointment.status_reverted')->value('meta'), true));
    }

    public function test_there_is_nothing_to_undo_for_a_booked_or_cancelled_appointment()
    {
        Carbon::setTestNow($this->at('2026-11-02 09:00'));
        $booked = $this->book('2026-11-02 10:00')->json('id');
        $cancelled = $this->book('2026-11-02 11:00')->json('id');
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $cancelled))->assertOk();

        foreach ([$booked, $cancelled] as $id) {
            $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['undo' => true])->assertStatus(422)->assertJsonPath('code', 'INVALID_TRANSITION');
        }
    }

    public function test_undoing_done_or_no_show_takes_the_doctors_time_back_unless_it_was_taken_meanwhile()
    {
        Carbon::setTestNow($this->at('2026-11-02 09:00'));
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'no_show'])->assertOk();
        $this->assertSame(0, $this->cellsOf($id));

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['undo' => true])->assertOk()->assertJson(['status' => 'confirmed']);
        $this->assertSame(8, $this->cellsOf($id));

        // Done, then someone else takes the time, then undo: refused, and nothing changes.
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => 'done'])->assertOk();
        $this->occupy($this->doctor, '2026-11-02 10:00');
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['undo' => true])->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');
        $this->assertSame('done', $this->actingAs($this->reception)->getJson(route('api.appointments.show', $id))->json('status'));
    }

    // Who may do what

    public function test_only_the_front_desk_books_moves_and_cancels_and_a_doctor_cannot()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        Doctor::factory()->forUser($doctorUser)->create();
        $id = $this->book('2026-11-02 10:00')->json('id');

        $this->book('2026-11-02 11:00', [], $doctorUser)->assertForbidden();
        $this->actingAs($doctorUser)->patchJson(route('api.appointments.reschedule', $id), ['startsAt' => $this->at('2026-11-02 15:00')->toIso8601String()])->assertForbidden();
        $this->actingAs($doctorUser)->postJson(route('api.appointments.cancel', $id))->assertForbidden();
        $this->actingAs($doctorUser)->getJson(route('api.availability', ['doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'date' => '2026-11-02']))->assertForbidden();
        $this->book('2026-11-03 10:00', [], $this->admin)->assertCreated();
    }

    public function test_a_doctor_may_only_start_or_finish_their_own_consultations()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $mine = Doctor::factory()->forUser($doctorUser)->create();
        $mine->services()->sync([$this->service->id]);
        $this->workWeekdays($mine);

        $own = $this->book('2026-11-02 10:00', ['doctorId' => $mine->id])->assertCreated()->json('id');
        $others = $this->book('2026-11-02 10:00')->assertCreated()->json('id');

        // Not at the desk yet: not theirs to start.
        $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $own), ['status' => 'in_consultation'])->assertForbidden();

        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $own), ['status' => 'arrived'])->assertOk();
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $others), ['status' => 'arrived'])->assertOk();

        $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $own), ['status' => 'in_consultation'])->assertOk()->assertJson(['status' => 'in_consultation']);
        $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $own), ['status' => 'done'])->assertOk()->assertJson(['status' => 'done']);

        $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $others), ['status' => 'in_consultation'])->assertForbidden();
        $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $own), ['undo' => true])->assertForbidden();
        $this->assertSame('arrived', $this->actingAs($this->reception)->getJson(route('api.appointments.show', $others))->json('status'));
    }

    public function test_a_doctor_cannot_mark_arrival_or_no_show_or_cancel()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $mine = Doctor::factory()->forUser($doctorUser)->create();
        $mine->services()->sync([$this->service->id]);
        $this->workWeekdays($mine);
        $own = $this->book('2026-11-02 10:00', ['doctorId' => $mine->id])->json('id');

        foreach (['confirmed', 'arrived', 'no_show', 'cancelled'] as $status) {
            $this->actingAs($doctorUser)->patchJson(route('api.appointments.status', $own), ['status' => $status])->assertForbidden();
        }

        $this->assertSame('booked', $this->actingAs($this->reception)->getJson(route('api.appointments.show', $own))->json('status'));
    }

    public function test_the_admin_may_move_an_appointment_through_every_stage()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');

        foreach (['arrived', 'in_consultation', 'done'] as $status) {
            $this->actingAs($this->admin)->patchJson(route('api.appointments.status', $id), ['status' => $status])->assertOk();
        }
    }

    public function test_nobody_signed_in_can_do_anything()
    {
        $id = $this->book('2026-11-02 10:00')->json('id');
        $this->app['auth']->forgetGuards();

        $this->postJson(route('api.appointments.store'), [])->assertUnauthorized();
        $this->getJson(route('api.appointments.show', $id))->assertUnauthorized();
        $this->getJson(route('api.appointments.index'))->assertUnauthorized();
        $this->patchJson(route('api.appointments.status', $id), ['status' => 'arrived'])->assertUnauthorized();
        $this->patchJson(route('api.appointments.reschedule', $id), [])->assertUnauthorized();
        $this->postJson(route('api.appointments.cancel', $id))->assertUnauthorized();
        $this->getJson(route('api.availability', ['doctorId' => 'x', 'serviceId' => 'y', 'date' => '2026-11-02']))->assertUnauthorized();
    }

    public function test_another_clinics_appointment_is_not_found_whoever_asks()
    {
        $otherClinic = Clinic::factory()->create();
        $foreign = Appointment::factory()->forClinic($otherClinic)->create();

        $this->actingAs($this->reception)->getJson(route('api.appointments.show', $foreign->id))->assertNotFound();
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $foreign->id), ['status' => 'arrived'])->assertNotFound();
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $foreign->id))->assertNotFound();
        $this->actingAs($this->reception)->patchJson(route('api.appointments.reschedule', $foreign->id), ['startsAt' => $this->at('2026-11-02 10:00')->toIso8601String()])->assertNotFound();
        $this->assertSame('booked', $foreign->fresh()->status->value);
    }
}
