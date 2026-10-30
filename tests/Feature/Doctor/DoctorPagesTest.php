<?php

namespace Tests\Feature\Doctor;

use App\Enums\AppointmentStatus;
use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** The doctor's pages (C1, C2, C4 and the sidebar badge): the doctor's own day, schedule and (for now) no requests. */
class DoctorPagesTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        // Monday 10:00 in the clinic.
        Carbon::setTestNow('2026-11-02 05:00:00');

        $this->me = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor->forceFill(['user_id' => $this->me->id])->save();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function row(string $local, array $state = [], ?Doctor $doctor = null): Appointment
    {
        $start = $this->at($local);

        return Appointment::factory()->forClinic($this->clinic, $doctor ?? $this->doctor, $this->patient, $this->service)
            ->create(['starts_at' => $start, 'ends_at' => $start->addMinutes(30), ...$state]);
    }

    private function read(string $url, array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->me)->getJson($url.($query === [] ? '' : '?'.http_build_query($query)));
    }

    /** @return list<string> */
    private function ids(array $rows): array
    {
        return array_column(array_column($rows, 'appointment'), 'id');
    }

    private function otherDoctor(): Doctor
    {
        $other = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Zain']);
        $other->services()->sync([$this->service->id]);

        return $other;
    }

    public function test_every_page_has_the_shape_the_screens_are_tested_with()
    {
        $this->row('2026-11-02 10:00', ['reason' => 'Check-up', 'created_by' => (string) $this->reception->id]);

        $this->assertSameShape($this->fixture('doctor-overview-view'), $this->read('/doctor')->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-calendar-view'), $this->read('/doctor/schedule', ['view' => 'day'])->assertOk()->json());
        $this->assertSameShape($this->fixture('doctor-requests-view'), $this->read('/doctor/requests')->assertOk()->json());
        $this->assertSameShape($this->fixture('doctor-shell-view'), $this->read('/doctor/shell')->assertOk()->json());
    }

    public function test_the_pages_without_a_json_request_are_still_the_pages()
    {
        foreach (['/doctor' => 'doctor/overview', '/doctor/schedule' => 'doctor/schedule', '/doctor/requests' => 'doctor/requests'] as $url => $component) {
            $this->actingAs($this->me)->get($url)->assertInertia(fn ($page) => $page->component($component));
        }
    }

    public function test_the_overview_is_the_doctors_own_day_in_time_order()
    {
        $late = $this->row('2026-11-02 15:00');
        $early = $this->row('2026-11-02 09:30', ['status' => AppointmentStatus::Arrived]);
        $this->row('2026-11-02 11:00', [], $this->otherDoctor());
        $this->row('2026-11-03 09:30');

        $view = $this->read('/doctor')->assertOk()->json();

        $this->assertSame($this->doctor->id, $view['doctor']['id']);
        $this->assertSame('2026-11-02', $view['today']);
        $this->assertSame([$early->id, $late->id], $this->ids($view['rows']));
        $this->assertSame(0, $view['pendingRequests']);
    }

    public function test_days_ahead_counts_days_in_the_next_thirty_with_something_not_cancelled()
    {
        $this->row('2026-11-02 15:00');
        $this->row('2026-11-03 09:30');
        $this->row('2026-11-03 11:00');
        $this->row('2026-11-05 09:30', ['status' => AppointmentStatus::Cancelled]);
        $this->row('2026-11-09 09:30');
        $this->row('2026-12-02 09:30');
        $this->row('2026-12-03 09:30');
        $this->row('2026-11-04 09:30', [], $this->otherDoctor());

        // 3 Nov, 9 Nov and 2 Dec (day 30); today, a cancelled day, day 31 and another doctor's day do not count.
        $this->assertSame(3, $this->read('/doctor')->json('daysAhead'));
    }

    public function test_the_doctor_may_only_start_and_finish_their_own_consultations()
    {
        $arrived = $this->row('2026-11-02 10:00', ['status' => AppointmentStatus::Arrived]);
        $booked = $this->row('2026-11-02 11:00');

        $rows = collect($this->read('/doctor')->json('rows'))->keyBy('appointment.id');

        $this->assertSame(['in_consultation', 'done'], $rows[$arrived->id]['allowed']['transitions']);
        $this->assertSame([false, false, false], [$rows[$arrived->id]['allowed']['canUndo'], $rows[$arrived->id]['allowed']['canReschedule'], $rows[$arrived->id]['allowed']['canCancel']]);
        $this->assertSame([], $rows[$booked->id]['allowed']['transitions']);

        $this->actingAs($this->me)->patchJson(route('api.appointments.status', $arrived->id), ['status' => 'in_consultation'])->assertOk();

        $after = collect($this->read('/doctor')->json('rows'))->keyBy('appointment.id');
        $this->assertSame('in_consultation', $after[$arrived->id]['appointment']['status']);
        $this->assertSame(['done'], $after[$arrived->id]['allowed']['transitions']);
    }

    public function test_the_schedule_has_only_the_doctors_own_appointments_and_only_themselves_in_the_lists()
    {
        $other = $this->otherDoctor();
        $monday = $this->row('2026-11-02 10:00');
        $friday = $this->row('2026-11-06 10:00');
        $this->row('2026-11-02 11:00', [], $other);

        $day = $this->read('/doctor/schedule', ['view' => 'day', 'date' => '2026-11-02'])->assertOk()->json();
        $week = $this->read('/doctor/schedule', ['view' => 'week', 'date' => '2026-11-04'])->json();

        $this->assertSame([$monday->id], $this->ids($day['rows']));
        $this->assertSame([$monday->id, $friday->id], $this->ids($week['rows']));
        $this->assertSame([$this->doctor->id], array_column($day['allDoctors'], 'id'));
        $this->assertSame([$this->doctor->id], array_column($day['doctors'], 'id'));
        $this->assertSame([$this->doctor->id], array_column(array_column($day['columns'], 'doctor'), 'id'));
        $this->assertSame([], $week['columns']);
        $this->assertSame('2026-11-02', $this->read('/doctor/schedule')->json('date'));
    }

    public function test_the_schedule_refuses_nonsense()
    {
        $this->read('/doctor/schedule', ['view' => 'month'])->assertStatus(422);
        $this->read('/doctor/schedule', ['date' => 'tomorrow'])->assertStatus(422);
    }

    public function test_a_doctor_switched_off_for_booking_still_sees_their_own_schedule()
    {
        $this->doctor->forceFill(['is_active' => false])->save();
        $mine = $this->row('2026-11-02 10:00');

        $view = $this->read('/doctor/schedule', ['view' => 'day'])->assertOk()->json();

        $this->assertSame([$mine->id], $this->ids($view['rows']));
        $this->assertSame([$this->doctor->id], array_column($view['doctors'], 'id'));
    }

    public function test_requests_and_the_badge_are_empty_until_patients_can_ask()
    {
        $view = $this->read('/doctor/requests')->assertOk()->json();

        $this->assertSame([[], []], [$view['pending'], $view['history']]);
        $this->assertSame($this->doctor->id, $view['doctor']['id']);
        $this->assertSame(0, $this->read('/doctor/shell')->json('pendingRequests'));
    }

    public function test_a_doctor_login_with_no_doctor_linked_gets_not_found()
    {
        $nobody = User::factory()->doctor()->forClinic($this->clinic)->create();

        foreach (['/doctor', '/doctor/schedule', '/doctor/requests'] as $url) {
            $this->read($url, [], $nobody)->assertNotFound()->assertJson(['code' => 'NOT_FOUND']);
        }

        // The sidebar badge never breaks the page around it.
        $this->read('/doctor/shell', [], $nobody)->assertOk();
    }

    public function test_only_the_doctor_reads_the_doctor_pages()
    {
        foreach (['/doctor', '/doctor/schedule', '/doctor/requests', '/doctor/shell'] as $url) {
            $this->read($url, [], $this->reception)->assertForbidden();
            $this->read($url, [], $this->admin)->assertForbidden();
        }
    }

    public function test_nobody_signed_out_reads_the_doctor_pages()
    {
        foreach (['/doctor', '/doctor/schedule', '/doctor/requests', '/doctor/shell'] as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
    }

    public function test_another_clinics_doctor_never_sees_this_clinics_data()
    {
        $this->row('2026-11-02 10:00');

        $other = Clinic::factory()->create();
        $otherUser = User::factory()->doctor()->forClinic($other)->create();
        Doctor::factory()->forClinic($other)->create(['user_id' => $otherUser->id]);

        $this->assertSame([], $this->read('/doctor', [], $otherUser)->assertOk()->json('rows'));
        $this->assertSame([], $this->read('/doctor/schedule', [], $otherUser)->assertOk()->json('rows'));
    }
}
