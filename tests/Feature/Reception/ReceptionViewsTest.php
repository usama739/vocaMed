<?php

namespace Tests\Feature\Reception;

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
use App\Views\Reception\AppointmentRows;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** The receptionist's page read models (B1 to B6): their shape, their filters and what each person is allowed to do. */
class ReceptionViewsTest extends TestCase
{
    use AssertsShape, BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        // Monday 10:00 in the clinic, when the doctor is at work.
        Carbon::setTestNow('2026-11-02 05:00:00');
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function row(string $local, array $state = [], ?Doctor $doctor = null, ?Patient $patient = null): Appointment
    {
        $start = $this->at($local);

        return Appointment::factory()->forClinic($this->clinic, $doctor ?? $this->doctor, $patient ?? $this->patient, $this->service)
            ->create(['starts_at' => $start, 'ends_at' => $start->addMinutes(30), ...$state]);
    }

    private function read(string $url, array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->getJson($url.($query === [] ? '' : '?'.http_build_query($query)));
    }

    /** @return list<string> */
    private function ids(array $rows): array
    {
        return array_column(array_column($rows, 'appointment'), 'id');
    }

    // Shapes

    public function test_every_page_has_the_shape_the_screens_are_tested_with()
    {
        $first = $this->row('2026-11-02 10:00', ['reason' => 'Check-up', 'created_by' => (string) $this->reception->id]);
        $this->row('2026-10-20 10:00', ['status' => AppointmentStatus::Done, 'reason' => 'Check-up', 'created_by' => (string) $this->reception->id]);

        $this->assertSameShape($this->fixture('reception-today-view'), $this->read('/reception')->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-appointments-view'), $this->read('/reception/appointments')->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-appointment-view'), $this->read("/reception/appointments/{$first->id}")->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-calendar-view'), $this->read('/reception/calendar', ['view' => 'day'])->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-patients-view'), $this->read('/reception/patients')->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-patient-view'), $this->read("/reception/patients/{$this->patient->id}")->assertOk()->json());
    }

    public function test_the_lookups_have_the_shape_the_screens_are_tested_with()
    {
        $this->assertSameShape($this->fixture('clinic-lookup'), $this->read(route('api.clinic'))->assertOk()->json());
        $this->assertSameShape([$this->fixture('reception-today-view')['days'][0]['doctor']], $this->read(route('api.doctors'))->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-today-view')['days'][0]['doctor'], $this->read(route('api.doctor', $this->doctor->id))->assertOk()->json());
        $this->assertSameShape($this->fixture('doctor-hours'), $this->read(route('api.doctor.availability', $this->doctor->id))->assertOk()->json());
        $this->assertSameShape($this->fixture('reception-today-view')['services'], $this->read(route('api.services'))->assertOk()->json());
    }

    public function test_the_page_without_a_json_request_is_still_the_page()
    {
        $this->actingAs($this->reception)->get('/reception')->assertInertia(fn ($page) => $page->component('reception/today'));
        $this->actingAs($this->reception)->get('/reception/appointments/abc')->assertInertia(fn ($page) => $page->component('reception/appointment')->where('id', 'abc'));
    }

    // Today

    public function test_today_lists_each_active_doctors_appointments_in_time_order()
    {
        $late = $this->row('2026-11-02 15:00');
        $early = $this->row('2026-11-02 09:30');
        $this->row('2026-11-03 09:30');
        $this->row('2026-11-01 09:30');
        $walkIn = $this->row('2026-11-02 11:00', ['source' => BookingSource::WalkIn, 'status' => AppointmentStatus::Arrived]);
        $inactive = Doctor::factory()->forClinic($this->clinic)->create(['is_active' => false]);
        $this->row('2026-11-02 10:00', [], $inactive);

        $view = $this->read('/reception')->assertOk()->json();

        $this->assertSame('2026-11-02', $view['today']);
        $this->assertCount(1, $view['days']);
        $this->assertSame($this->doctor->id, $view['days'][0]['doctor']['id']);
        $this->assertSame([$early->id, $walkIn->id, $late->id], $this->ids($view['days'][0]['rows']));
        $this->assertFalse($view['days'][0]['notWorking']);
        $this->assertSame([$this->service->id], array_column($view['services'], 'id'));
    }

    public function test_today_shows_the_next_free_slot_for_the_doctors_default_service()
    {
        $slot = $this->read('/reception')->json('days.0.nextFree');

        $this->assertSame($this->doctor->id, $slot['doctorId']);
        $this->assertSame($this->service->id, $slot['serviceId']);
        $this->assertSame('free', $slot['state']);
        $this->assertGreaterThanOrEqual('2026-11-02T05:00:00.000Z', $slot['startsAt']);
    }

    public function test_a_default_service_is_the_first_active_one_the_doctor_offers_by_name()
    {
        $off = Service::factory()->forClinic($this->clinic)->create(['name' => 'Aardvark', 'is_active' => false]);
        $other = Service::factory()->forClinic($this->clinic)->create(['name' => 'Bandage', 'duration_minutes' => 15, 'buffer_minutes' => 0]);
        $this->doctor->services()->sync([$off->id, $other->id, $this->service->id]);

        $this->assertSame($other->id, $this->read('/reception')->json('days.0.nextFree.serviceId'));
    }

    public function test_a_doctor_with_nothing_to_book_has_no_next_free_slot()
    {
        $this->doctor->services()->sync([]);

        $this->assertNull($this->read('/reception')->json('days.0.nextFree'));
    }

    public function test_a_doctor_is_not_working_on_a_day_off_a_holiday_or_leave()
    {
        // Sunday: no hours.
        Carbon::setTestNow('2026-11-01 05:00:00');
        $this->assertTrue($this->read('/reception')->json('days.0.notWorking'));

        // A clinic holiday on a working day.
        Carbon::setTestNow('2026-11-02 05:00:00');
        app(TenantContext::class)->run($this->clinic, fn () => (new ClinicHoliday)->forceFill(['date' => '2026-11-02', 'name' => 'Holiday'])->save());
        $this->assertTrue($this->read('/reception')->json('days.0.notWorking'));

        // Leave on a working day.
        ClinicHoliday::withoutGlobalScopes()->delete();
        $this->workWeekdays($this->doctor, [], [['id' => null, 'startDate' => '2026-11-01', 'endDate' => '2026-11-03', 'reason' => 'Away']]);
        $this->assertTrue($this->read('/reception')->json('days.0.notWorking'));
    }

    // allowed

    public function test_what_the_receptionist_may_do_follows_the_status_and_the_day()
    {
        $booked = $this->row('2026-11-02 10:00');
        $arrived = $this->row('2026-11-02 11:00', ['status' => AppointmentStatus::Arrived]);
        $done = $this->row('2026-11-02 12:00', ['status' => AppointmentStatus::Done]);
        $yesterday = $this->row('2026-11-01 12:00', ['status' => AppointmentStatus::Arrived]);

        $rows = collect($this->read('/reception/appointments', ['sort' => 'asc'])->assertOk()->json('page.items'))->keyBy('appointment.id');

        $this->assertSame(['confirmed', 'arrived', 'in_consultation', 'done', 'cancelled', 'no_show'], $rows[$booked->id]['allowed']['transitions']);
        $this->assertSame([false, true, true], [$rows[$booked->id]['allowed']['canUndo'], $rows[$booked->id]['allowed']['canReschedule'], $rows[$booked->id]['allowed']['canCancel']]);

        $this->assertSame(['in_consultation', 'done', 'cancelled', 'no_show'], $rows[$arrived->id]['allowed']['transitions']);
        $this->assertSame([true, false, false], [$rows[$arrived->id]['allowed']['canUndo'], $rows[$arrived->id]['allowed']['canReschedule'], $rows[$arrived->id]['allowed']['canCancel']]);

        $this->assertSame([], $rows[$done->id]['allowed']['transitions']);
        $this->assertTrue($rows[$done->id]['allowed']['canUndo']);

        // Yesterday's stage can no longer be undone.
        $this->assertFalse($rows[$yesterday->id]['allowed']['canUndo']);
    }

    public function test_what_a_doctor_may_do_is_only_starting_and_finishing_their_own_consultations()
    {
        $user = User::factory()->doctor()->forClinic($this->clinic)->create();
        $mine = Doctor::factory()->forClinic($this->clinic)->create(['user_id' => $user->id]);
        $mine->services()->sync([$this->service->id]);
        $own = $this->row('2026-11-02 10:00', ['status' => AppointmentStatus::Arrived], $mine);
        $booked = $this->row('2026-11-02 11:00', [], $mine);
        $notMine = $this->row('2026-11-02 12:00', ['status' => AppointmentStatus::Arrived]);

        $rows = app(TenantContext::class)->run($this->clinic, fn () => collect(app(AppointmentRows::class)->of(
            $this->clinic,
            $user,
            new Collection([$own, $booked, $notMine]),
        ))->keyBy('appointment.id'));

        $this->assertSame(['in_consultation', 'done'], $rows[$own->id]['allowed']['transitions']);
        $this->assertSame([false, false, false], [$rows[$own->id]['allowed']['canUndo'], $rows[$own->id]['allowed']['canReschedule'], $rows[$own->id]['allowed']['canCancel']]);
        $this->assertSame([], $rows[$booked->id]['allowed']['transitions']);
        $this->assertSame([], $rows[$notMine->id]['allowed']['transitions']);
    }

    public function test_a_row_says_who_booked_it()
    {
        $byReception = $this->row('2026-11-02 10:00', ['created_by' => (string) $this->reception->id]);
        $byPatient = $this->row('2026-11-02 11:00', ['created_by' => 'patient']);
        $bySystem = $this->row('2026-11-02 12:00', ['created_by' => null]);

        $rows = collect($this->read('/reception/appointments')->json('page.items'))->keyBy('appointment.id');

        $this->assertSame(['kind' => 'user', 'name' => $this->reception->name], $rows[$byReception->id]['createdBy']);
        $this->assertSame(['kind' => 'patient', 'name' => null], $rows[$byPatient->id]['createdBy']);
        $this->assertSame(['kind' => 'system', 'name' => null], $rows[$bySystem->id]['createdBy']);
    }

    public function test_the_no_show_count_on_a_patient_counts_their_no_shows()
    {
        $this->row('2026-10-20 10:00', ['status' => AppointmentStatus::NoShow]);
        $this->row('2026-10-21 10:00', ['status' => AppointmentStatus::NoShow]);
        $this->row('2026-11-02 10:00');

        $this->assertSame(2, $this->read('/reception/appointments', ['sort' => 'asc'])->json('page.items.0.patient.noShowCount'));
        $this->assertSame(2, $this->read("/reception/patients/{$this->patient->id}")->json('patient.noShowCount'));
    }

    // Appointments

    public function test_the_list_filters_by_when_doctor_status_and_patient()
    {
        $other = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed', 'phone' => '+923007654321']);
        $today = $this->row('2026-11-02 10:00');
        $soon = $this->row('2026-11-09 10:00', [], null, $other);
        $far = $this->row('2026-11-20 10:00');
        $recent = $this->row('2026-10-28 10:00', ['status' => AppointmentStatus::Done]);
        $old = $this->row('2026-10-01 10:00', ['status' => AppointmentStatus::Done]);
        $ids = fn (array $query) => $this->ids($this->read('/reception/appointments', ['sort' => 'asc', ...$query])->assertOk()->json('page.items'));

        $this->assertSame([$old->id, $recent->id, $today->id, $soon->id, $far->id], $ids([]));
        $this->assertSame([$today->id], $ids(['when' => 'today']));
        $this->assertSame([$today->id, $soon->id], $ids(['when' => 'next7']));
        $this->assertSame([$recent->id], $ids(['when' => 'past7']));
        $this->assertSame([$old->id, $recent->id], $ids(['status' => 'done']));
        $this->assertSame([$soon->id], $ids(['q' => 'bilal']));
        $this->assertSame([$soon->id], $ids(['q' => '7654']));
        $this->assertSame([], $ids(['doctorId' => 'nobody']));
        $this->assertCount(5, $ids(['doctorId' => $this->doctor->id]));
    }

    public function test_the_list_sorts_and_pages_in_tens()
    {
        foreach (range(1, 12) as $day) {
            $this->row(sprintf('2026-11-%02d 10:00', $day + 2));
        }

        $first = $this->read('/reception/appointments', ['sort' => 'asc'])->json('page');
        $second = $this->read('/reception/appointments', ['sort' => 'asc', 'page' => 2])->json('page');
        $newest = $this->read('/reception/appointments', ['sort' => 'desc'])->json('page');

        $this->assertSame([12, 1, 10], [$first['total'], $first['page'], $first['perPage']]);
        $this->assertCount(10, $first['items']);
        $this->assertCount(2, $second['items']);
        $this->assertSame('2026-11-14T05:00:00.000Z', $newest['items'][0]['appointment']['startsAt']);
        $this->assertCount(3, $this->read('/reception/appointments', ['perPage' => 3])->json('page.items'));
    }

    public function test_the_list_gives_every_doctor_for_the_filter_and_refuses_nonsense()
    {
        $inactive = Doctor::factory()->forClinic($this->clinic)->create(['is_active' => false]);

        $this->assertContains($inactive->id, array_column($this->read('/reception/appointments')->json('doctors'), 'id'));
        $this->read('/reception/appointments', ['when' => 'someday'])->assertStatus(422);
        $this->read('/reception/appointments', ['perPage' => 500])->assertStatus(422);
        $this->read('/reception/appointments', ['status' => 'lost'])->assertStatus(422);
    }

    // Detail

    public function test_the_detail_has_the_history_of_the_appointment_with_who_did_it()
    {
        $booked = $this->actingAs($this->reception)->postJson(route('api.appointments.store'), [
            'patientId' => $this->patient->id, 'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id,
            'startsAt' => $this->at('2026-11-02 11:00')->format('Y-m-d\TH:i:s\Z'), 'source' => 'manual',
        ])->assertCreated()->json();
        $this->actingAs($this->reception)->patchJson(route('api.appointments.status', $booked['id']), ['status' => 'arrived'])->assertOk();

        $view = $this->read("/reception/appointments/{$booked['id']}")->assertOk()->json();

        $this->assertSame($booked['id'], $view['row']['appointment']['id']);
        $this->assertSame(['appointment.created', 'appointment.status_changed'], array_column($view['history'], 'action'));
        $this->assertSame(['source' => 'manual'], $view['history'][0]['meta']);
        $this->assertSame(['kind' => 'user', 'name' => $this->reception->name], $view['history'][1]['actor']);
        $this->assertSame([], $view['timeline']);
    }

    public function test_an_unknown_appointment_or_one_from_another_clinic_is_not_found()
    {
        $other = Clinic::factory()->create();
        $theirs = Appointment::factory()->forClinic($other)->create();

        $this->read('/reception/appointments/nothing')->assertNotFound()->assertJson(['code' => 'NOT_FOUND']);
        $this->read("/reception/appointments/{$theirs->id}")->assertNotFound();
    }

    // Calendar

    public function test_the_calendar_covers_a_day_a_week_or_a_month()
    {
        $monday = $this->row('2026-11-02 10:00');
        $friday = $this->row('2026-11-06 10:00');
        $nextMonday = $this->row('2026-11-09 10:00');
        $lastMonth = $this->row('2026-10-30 10:00');
        $rows = fn (array $query) => $this->ids($this->read('/reception/calendar', $query)->assertOk()->json('rows'));

        $this->assertSame([$monday->id], $rows(['view' => 'day', 'date' => '2026-11-02']));
        $this->assertSame([$monday->id, $friday->id], $rows(['view' => 'week', 'date' => '2026-11-04']));
        $this->assertSame([$monday->id, $friday->id, $nextMonday->id], $rows(['view' => 'month', 'date' => '2026-11-15']));
        $this->assertSame([$lastMonth->id], $rows(['view' => 'week', 'date' => '2026-10-28']));
    }

    public function test_the_calendar_defaults_to_todays_day_view_and_tells_the_servers_time()
    {
        $view = $this->read('/reception/calendar')->assertOk()->json();

        $this->assertSame(['2026-11-02', '2026-11-02'], [$view['today'], $view['date']]);
        $this->assertSame('2026-11-02T05:00:00.000Z', $view['nowIso']);
        $this->assertCount(1, $view['columns']);
    }

    public function test_the_day_view_has_a_column_per_doctor_with_slots_and_hours_but_the_week_does_not()
    {
        $column = $this->read('/reception/calendar', ['view' => 'day', 'date' => '2026-11-03'])->json('columns.0');

        $this->assertSame($this->doctor->id, $column['doctor']['id']);
        $this->assertSame($this->service->id, $column['service']['id']);
        $this->assertNotEmpty($column['slots']);
        $this->assertFalse($column['offToday']);
        $this->assertSame(['weekday' => 1, 'start' => '09:00', 'end' => '17:00', 'breaks' => []], $column['availability']['windows'][0]);
        $this->assertSame([], $this->read('/reception/calendar', ['view' => 'week'])->json('columns'));
        $this->assertSame([], $this->read('/reception/calendar', ['view' => 'month'])->json('columns'));
    }

    public function test_a_lunch_break_is_a_gap_in_the_window_and_leave_marks_the_doctor_off()
    {
        $this->workWeekdays($this->doctor, [1 => ['lunch' => true]], [['id' => null, 'startDate' => '2026-11-10', 'endDate' => '2026-11-12', 'reason' => 'Away']], [['weekday' => 1, 'time' => '12:30']]);

        $monday = $this->read('/reception/calendar', ['view' => 'day', 'date' => '2026-11-02'])->json('columns.0');
        $away = $this->read('/reception/calendar', ['view' => 'day', 'date' => '2026-11-11'])->json('columns.0');

        $window = collect($monday['availability']['windows'])->firstWhere('weekday', 1);
        $this->assertSame([['start' => '13:00', 'end' => '14:00']], $window['breaks']);
        $this->assertSame([['weekday' => 1, 'time' => '12:30']], $monday['availability']['blocked']);
        $this->assertSame('Away', $monday['availability']['timeOff'][0]['reason']);
        $this->assertTrue($away['offToday']);
    }

    public function test_a_doctor_with_no_service_has_no_service_key_and_no_slots()
    {
        $this->doctor->services()->sync([]);

        $column = $this->read('/reception/calendar', ['view' => 'day', 'date' => '2026-11-03'])->json('columns.0');

        $this->assertArrayNotHasKey('service', $column);
        $this->assertSame([], $column['slots']);
    }

    public function test_the_calendar_can_be_narrowed_to_one_doctor()
    {
        $second = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Zain']);
        $mine = $this->row('2026-11-02 10:00');
        $theirs = $this->row('2026-11-02 11:00', [], $second);

        $all = $this->read('/reception/calendar', ['view' => 'day', 'doctorId' => 'all'])->json();
        $one = $this->read('/reception/calendar', ['view' => 'day', 'doctorId' => $second->id])->json();

        $this->assertCount(2, $all['doctors']);
        $this->assertSame([$mine->id, $theirs->id], $this->ids($all['rows']));
        $this->assertCount(2, $one['allDoctors']);
        $this->assertSame([$second->id], array_column($one['doctors'], 'id'));
        $this->assertSame([$theirs->id], $this->ids($one['rows']));
    }

    public function test_the_calendar_refuses_nonsense()
    {
        $this->read('/reception/calendar', ['view' => 'year'])->assertStatus(422);
        $this->read('/reception/calendar', ['date' => 'tomorrow'])->assertStatus(422);
    }

    // Patients

    public function test_patients_are_the_recent_ones_or_a_search_with_their_last_visit_and_next_appointment()
    {
        $this->row('2026-10-20 10:00', ['status' => AppointmentStatus::Done]);
        $this->row('2026-10-25 10:00', ['status' => AppointmentStatus::Done]);
        $this->row('2026-10-26 10:00', ['status' => AppointmentStatus::Cancelled]);
        $this->row('2026-11-02 10:00');
        $this->row('2026-11-09 10:00', ['status' => AppointmentStatus::Confirmed]);
        $stranger = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Zara Noor']);

        $recent = collect($this->read('/reception/patients')->assertOk()->json('rows'))->keyBy('patient.id');
        $found = $this->read('/reception/patients', ['q' => 'ayesha'])->json('rows');

        $this->assertSame('2026-10-25T05:00:00.000Z', $recent[$this->patient->id]['lastVisit']);
        $this->assertSame('2026-11-02T05:00:00.000Z', $recent[$this->patient->id]['next']);
        $this->assertNull($recent[$stranger->id]['lastVisit']);
        $this->assertNull($recent[$stranger->id]['next']);
        $this->assertSame([$this->patient->id], array_column(array_column($found, 'patient'), 'id'));
        $this->assertSame([], $this->read('/reception/patients', ['q' => 'nobody at all'])->json('rows'));
    }

    public function test_a_patients_detail_has_all_their_appointments_newest_first()
    {
        $old = $this->row('2026-10-20 10:00', ['status' => AppointmentStatus::Done]);
        $new = $this->row('2026-11-09 10:00');
        $this->row('2026-11-05 10:00', [], null, Patient::factory()->forClinic($this->clinic)->create());

        $view = $this->read("/reception/patients/{$this->patient->id}")->assertOk()->json();

        $this->assertSame($this->patient->id, $view['patient']['id']);
        $this->assertSame([$new->id, $old->id], $this->ids($view['appointments']));
    }

    public function test_an_unknown_patient_or_one_from_another_clinic_is_not_found()
    {
        $theirs = Patient::factory()->forClinic(Clinic::factory()->create())->create();

        $this->read('/reception/patients/nothing')->assertNotFound()->assertJson(['code' => 'NOT_FOUND']);
        $this->read("/reception/patients/{$theirs->id}")->assertNotFound();
    }

    // Lookups

    public function test_the_lookups_give_the_clinic_doctors_and_services_and_can_hide_the_switched_off()
    {
        $off = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Off', 'is_active' => false]);
        Service::factory()->forClinic($this->clinic)->create(['name' => 'Aardvark', 'is_active' => false]);

        $this->assertSame($this->clinic->id, $this->read(route('api.clinic'))->json('clinic.id'));
        $this->assertSame($this->clinic->id, $this->read(route('api.clinic'))->json('settings.clinicId'));
        $this->assertContains($off->id, array_column($this->read(route('api.doctors'))->json(), 'id'));
        $this->assertNotContains($off->id, array_column($this->read(route('api.doctors', ['activeOnly' => 1]))->json(), 'id'));
        $this->assertSame(['Aardvark', 'Check-up'], array_column($this->read(route('api.services'))->json(), 'name'));
        $this->assertSame(['Check-up'], array_column($this->read(route('api.services', ['activeOnly' => 1]))->json(), 'name'));
    }

    public function test_the_next_free_slot_is_a_slot_or_null()
    {
        $off = Service::factory()->forClinic($this->clinic)->create(['is_active' => false]);
        $unoffered = Service::factory()->forClinic($this->clinic)->create();
        $this->doctor->services()->attach($off->id);

        $free = fn (string $serviceId) => $this->read(route('api.doctor.next-free', $this->doctor->id), ['serviceId' => $serviceId])->assertOk()->json('slot');

        $this->assertSame($this->service->id, $free($this->service->id)['serviceId']);
        $this->assertNull($free($off->id));
        $this->assertNull($free($unoffered->id));
        $this->assertNull($free('nothing'));
        $this->read(route('api.doctor.next-free', $this->doctor->id))->assertStatus(422);
    }

    public function test_another_clinics_doctor_is_not_found_in_the_lookups()
    {
        $theirs = Doctor::factory()->forClinic(Clinic::factory()->create())->create();

        $this->read(route('api.doctor', $theirs->id))->assertNotFound();
        $this->read(route('api.doctor.availability', $theirs->id))->assertNotFound();
        $this->read(route('api.doctor.next-free', $theirs->id), ['serviceId' => $this->service->id])->assertNotFound();
    }

    // Access

    public function test_every_staff_role_reads_the_lookups_but_only_the_desk_reads_the_reception_pages()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();

        $this->read(route('api.doctors'), [], $doctorUser)->assertOk();
        $this->read(route('api.clinic'), [], $this->admin)->assertOk();
        $this->read('/reception', [], $doctorUser)->assertForbidden();
        $this->read('/reception/calendar', [], $this->admin)->assertForbidden();
    }

    public function test_nobody_signed_out_reads_anything()
    {
        $this->getJson(route('api.doctors'))->assertUnauthorized();
        $this->getJson(route('api.clinic'))->assertUnauthorized();
        $this->getJson('/reception')->assertUnauthorized();
        $this->getJson('/reception/patients')->assertUnauthorized();
    }

    public function test_one_clinic_never_sees_anothers_appointments_in_any_page()
    {
        $other = Clinic::factory()->create();
        $theirs = Appointment::factory()->forClinic($other)->create(['starts_at' => $this->at('2026-11-02 10:00'), 'ends_at' => $this->at('2026-11-02 10:30')]);

        foreach (['/reception', '/reception/appointments', '/reception/calendar', '/reception/patients'] as $url) {
            $this->assertStringNotContainsString($theirs->id, (string) $this->read($url)->assertOk()->getContent(), $url);
        }
    }
}
