<?php

namespace Tests\Feature\Booking;

use App\Models\Doctor;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** What booking made possible for earlier steps: the real "next free" and "upcoming" on the Doctors list, the bookings a change to availability would strand, and the patient's no-show count. */
class FollowUpsTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

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

    private function book(string $local, ?Patient $patient = null, ?Doctor $doctor = null): string
    {
        return $this->actingAs($this->reception)->postJson(route('api.appointments.store'), [
            'patientId' => ($patient ?? $this->patient)->id, 'doctorId' => ($doctor ?? $this->doctor)->id, 'serviceId' => $this->service->id,
            'startsAt' => $this->at($local)->toIso8601String(),
        ])->assertCreated()->json('id');
    }

    private function setStatus(string $id, string $status): void
    {
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $id), ['status' => $status])->assertOk();
    }

    private function row(string $doctorId): array
    {
        return collect($this->actingAs($this->admin)->getJson(route('admin.doctors'))->assertOk()->json('rows'))->first(fn ($r) => $r['doctor']['id'] === $doctorId);
    }

    /**
     * @param  array<string, mixed>  $change  overrides on the doctor's Monday: start, end, lunch
     */
    private function previewWith(array $change = [], array $timeOff = [], array $blocked = []): array
    {
        $days = array_map(fn (int $w) => ['weekday' => $w, 'on' => $w >= 1 && $w <= 5, 'start' => '09:00', 'end' => '17:00', 'lunch' => false, ...($w === 1 ? $change : [])], [1, 2, 3, 4, 5, 6, 0]);

        return $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', $this->doctor->id), ['days' => $days, 'timeOff' => $timeOff, 'blocked' => $blocked])->assertOk()->json('affected');
    }

    // The Doctors list

    public function test_the_doctors_list_shows_the_next_free_slot_and_how_many_appointments_are_to_come()
    {
        $first = $this->book('2026-11-02 09:00');
        $this->book('2026-11-02 14:00');
        $this->book('2026-11-03 10:00');

        $row = $this->row($this->doctor->id);

        $this->assertSame('2026-11-02T05:00:00.000Z', $row['nextFree']['startsAt'] ?? null, '09:00 is booked and its buffer reaches 09:40, so 09:30 is not free and 10:00 is the next free');
        $this->assertSame(3, $row['upcoming']);
        $this->assertSame($this->service->id, $row['nextFree']['serviceId']);
        $this->assertNotEmpty($first);
    }

    public function test_only_booked_and_confirmed_appointments_still_to_come_are_counted()
    {
        $kept = $this->book('2026-11-02 09:00');
        $this->setStatus($kept, 'confirmed');
        $this->setStatus($this->book('2026-11-02 10:00'), 'arrived');
        $cancelled = $this->book('2026-11-02 11:00');
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $cancelled))->assertOk();
        $this->setStatus($this->book('2026-11-02 12:00'), 'no_show');
        $this->book('2026-11-03 09:00');

        $this->assertSame(2, $this->row($this->doctor->id)['upcoming']);
        $this->assertSame(2, $this->actingAs($this->admin)->getJson(route('admin.doctor', $this->doctor->id))->json('upcoming'));
    }

    public function test_a_doctor_who_is_switched_off_or_has_no_hours_has_no_next_free_slot()
    {
        $nobody = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. No Hours']);
        $nobody->services()->sync([$this->service->id]);
        $off = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Off', 'is_active' => false]);
        $off->services()->sync([$this->service->id]);
        $this->workWeekdays($off);

        $this->assertNull($this->row($nobody->id)['nextFree']);
        $this->assertNull($this->row($off->id)['nextFree']);
        $this->assertNotNull($this->row($this->doctor->id)['nextFree']);
    }

    public function test_a_doctor_offering_no_active_service_has_no_next_free_slot()
    {
        $this->service->forceFill(['is_active' => false])->save();

        $this->assertNull($this->row($this->doctor->id)['nextFree']);
    }

    // The bookings an availability change would strand

    public function test_a_change_that_leaves_a_booking_outside_the_hours_names_it()
    {
        $this->book('2026-11-02 15:00');
        $this->book('2026-11-02 10:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']));

        $affected = $this->previewWith(['end' => '12:00']);

        $this->assertSame(['Ayesha Khan'], array_column($affected, 'patientName'));
        $this->assertSame('2026-11-02T10:00:00.000Z', $affected[0]['startsAt']);
        $this->assertNotEmpty($affected[0]['appointmentId']);
    }

    public function test_lunch_a_closed_half_hour_and_leave_strand_what_they_cover()
    {
        $this->book('2026-11-02 13:00');
        $this->book('2026-11-02 10:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']));
        $this->book('2026-11-03 10:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Chand Ali']));

        $this->assertSame(['Ayesha Khan'], array_column($this->previewWith(['lunch' => true]), 'patientName'));
        $this->assertSame(['Bilal Ahmed'], array_column($this->previewWith([], [], [['weekday' => 1, 'time' => '10:00']]), 'patientName'));
        $this->assertSame(['Chand Ali'], array_column($this->previewWith([], [['id' => null, 'startDate' => '2026-11-03', 'endDate' => '2026-11-03', 'reason' => '']]), 'patientName'));
    }

    public function test_an_unchanged_draft_strands_nobody_and_the_list_is_in_time_order()
    {
        $this->book('2026-11-02 15:00');
        $this->book('2026-11-02 10:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']));

        $this->assertSame([], $this->previewWith());
        $this->assertSame(['Bilal Ahmed', 'Ayesha Khan'], array_column($this->previewWith(['on' => false]), 'patientName'));
    }

    public function test_cancelled_finished_and_past_appointments_are_never_stranded()
    {
        $cancelled = $this->book('2026-11-02 10:00');
        $this->actingAs($this->reception)->postJson(route('api.appointments.cancel', $cancelled))->assertOk();
        $this->setStatus($this->book('2026-11-02 11:00', Patient::factory()->forClinic($this->clinic)->create()), 'done');
        $this->book('2026-11-02 12:00', Patient::factory()->forClinic($this->clinic)->create(['name' => 'Still Booked']));

        $this->assertSame(['Still Booked'], array_column($this->previewWith(['on' => false]), 'patientName'));

        Carbon::setTestNow($this->at('2026-11-02 13:00'));
        $this->assertSame([], $this->previewWith(['on' => false]), 'the visit has passed');
    }

    public function test_a_doctor_who_does_not_exist_yet_strands_nobody_and_the_doctors_own_preview_works_too()
    {
        $this->book('2026-11-02 10:00');
        $days = array_map(fn (int $w) => ['weekday' => $w, 'on' => false, 'start' => '09:00', 'end' => '17:00', 'lunch' => false], [1, 2, 3, 4, 5, 6, 0]);

        $this->assertSame([], $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', 'new'), ['days' => $days, 'timeOff' => [], 'blocked' => []])->json('affected'));

        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor->forceFill(['user_id' => $doctorUser->id])->save();
        $this->assertCount(1, $this->actingAs($doctorUser)->postJson(route('doctor.availability.preview'), ['days' => $days, 'timeOff' => [], 'blocked' => []])->assertOk()->json('affected'));
    }

    // The no-show count

    public function test_a_patients_no_shows_are_counted_from_their_appointments_and_come_back_down_on_undo()
    {
        $this->assertSame(0, $this->actingAs($this->reception)->getJson(route('api.patients.show', $this->patient->id))->json('noShowCount'));

        $one = $this->book('2026-11-02 09:00');
        $two = $this->book('2026-11-02 11:00');
        $this->setStatus($one, 'no_show');
        $this->setStatus($two, 'no_show');

        $this->assertSame(2, $this->actingAs($this->reception)->getJson(route('api.patients.show', $this->patient->id))->json('noShowCount'));
        $this->assertSame(2, $this->actingAs($this->reception)->getJson(route('api.patients.search', ['q' => 'ayesha']))->json('0.noShowCount'));
        $this->assertSame(2, $this->actingAs($this->reception)->getJson(route('api.patients.recent'))->json('0.noShowCount'));

        Carbon::setTestNow($this->at('2026-11-02 10:00'));
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $one), ['undo' => true])->assertOk();
        $this->assertSame(1, $this->actingAs($this->reception)->getJson(route('api.patients.show', $this->patient->id))->json('noShowCount'));
    }

    public function test_one_patients_no_shows_never_count_for_another()
    {
        $other = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Other Person']);
        $this->setStatus($this->book('2026-11-02 09:00'), 'no_show');

        $this->assertSame(0, $this->actingAs($this->reception)->getJson(route('api.patients.show', $other->id))->json('noShowCount'));
    }
}
