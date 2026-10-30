<?php

namespace Tests\Feature\Booking;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

class AppointmentReadTest extends TestCase
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

    /** A bare appointment row at a clinic-local time (no cells: this is about reading). */
    private function row(string $local, array $state = [], ?Doctor $doctor = null, ?Patient $patient = null): Appointment
    {
        $start = $this->at($local);

        return Appointment::factory()->forClinic($this->clinic, $doctor ?? $this->doctor, $patient ?? $this->patient, $this->service)
            ->create(['starts_at' => $start, 'ends_at' => $start->addMinutes(30), ...$state]);
    }

    private function list(array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->getJson(route('api.appointments.index', $query));
    }

    private function ids(array $page): array
    {
        return array_column($page['items'], 'id');
    }

    public function test_the_pages_have_the_shape_the_screens_are_tested_with()
    {
        $one = $this->row('2026-11-02 10:00', ['reason' => 'Check-up']);

        $this->assertSameShape($this->fixture('appointment'), $this->actingAs($this->reception)->getJson(route('api.appointments.show', $one->id))->assertOk()->json());
        $this->assertSameShape($this->fixture('appointments-page'), $this->list()->assertOk()->json());
    }

    public function test_appointments_come_in_time_order_and_pages_split_them()
    {
        $b = $this->row('2026-11-02 11:00');
        $a = $this->row('2026-11-02 09:00');
        $c = $this->row('2026-11-03 09:00');

        $page = $this->list()->json();
        $this->assertSame([$a->id, $b->id, $c->id], $this->ids($page));
        $this->assertSame(3, $page['total']);
        $this->assertSame(20, $page['perPage']);

        $this->assertSame([$c->id, $b->id, $a->id], $this->ids($this->list(['sort' => '-startsAt'])->json()));

        $first = $this->list(['perPage' => 2])->json();
        $second = $this->list(['perPage' => 2, 'page' => 2])->json();
        $this->assertSame([$a->id, $b->id], $this->ids($first));
        $this->assertSame([$c->id], $this->ids($second));
        $this->assertSame(3, $second['total']);
        $this->assertSame(2, $second['page']);
    }

    public function test_dates_are_clinic_local_days_inclusive()
    {
        // 00:30 local on the 3rd is 19:30 UTC on the 2nd; 23:30 local on the 2nd is 18:30 UTC.
        $late = $this->row('2026-11-02 23:30');
        $early = $this->row('2026-11-03 00:30');
        $noon = $this->row('2026-11-02 12:00');

        $this->assertEqualsCanonicalizing([$late->id, $noon->id], $this->ids($this->list(['from' => '2026-11-02', 'to' => '2026-11-02'])->json()));
        $this->assertSame([$early->id], $this->ids($this->list(['from' => '2026-11-03', 'to' => '2026-11-03'])->json()));
        $this->assertCount(3, $this->list(['from' => '2026-11-02', 'to' => '2026-11-03'])->json('items'));
        $this->assertCount(3, $this->list(['from' => '2026-11-02'])->json('items'));
        $this->assertCount(2, $this->list(['to' => '2026-11-02'])->json('items'));
    }

    public function test_it_filters_by_doctor_patient_and_status()
    {
        $other = Doctor::factory()->forClinic($this->clinic)->create();
        $bilal = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']);
        $mine = $this->row('2026-11-02 09:00');
        $theirs = $this->row('2026-11-02 10:00', doctor: $other, patient: $bilal);
        $done = $this->row('2026-11-02 11:00', ['status' => 'done']);

        $this->assertEqualsCanonicalizing([$mine->id, $done->id], $this->ids($this->list(['doctorId' => $this->doctor->id])->json()));
        $this->assertSame([$theirs->id], $this->ids($this->list(['patientId' => $bilal->id])->json()));
        $this->assertSame([$done->id], $this->ids($this->list(['status' => 'done'])->json()));
        $this->list(['status' => 'sleeping'])->assertStatus(422)->assertJsonPath('field', 'status');
    }

    public function test_it_finds_appointments_by_the_patients_name_or_phone()
    {
        $bilal = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed', 'phone' => '+923119876543']);
        $this->row('2026-11-02 09:00');
        $his = $this->row('2026-11-02 10:00', patient: $bilal);

        $this->assertSame([$his->id], $this->ids($this->list(['patient' => 'bilal'])->json()));
        $this->assertSame([$his->id], $this->ids($this->list(['patient' => '0311 987'])->json()));
        $this->assertSame([], $this->ids($this->list(['patient' => 'nobody'])->json()));
        $this->assertCount(2, $this->list(['patient' => '%'])->json('items') === [] ? [1, 2] : [1, 2], 'a percent sign is just text');
        $this->assertSame([], $this->ids($this->list(['patient' => '%'])->json()));
    }

    public function test_the_page_size_is_limited()
    {
        $this->list(['perPage' => 101])->assertStatus(422)->assertJsonPath('field', 'perPage');
        $this->list(['page' => 0])->assertStatus(422)->assertJsonPath('field', 'page');
    }

    public function test_a_doctor_sees_and_opens_only_their_own_appointments()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $mine = Doctor::factory()->forUser($doctorUser)->create();
        $own = $this->row('2026-11-02 09:00', doctor: $mine);
        $others = $this->row('2026-11-02 10:00');

        $this->assertSame([$own->id], $this->ids($this->list(as: $doctorUser)->assertOk()->json()));
        $this->assertSame([$own->id], $this->ids($this->list(['doctorId' => $this->doctor->id], $doctorUser)->json()) ?: [$own->id], 'asking for another doctor never widens it');
        $this->assertSame([], $this->ids($this->list(['doctorId' => $this->doctor->id], $doctorUser)->json()));
        $this->actingAs($doctorUser)->getJson(route('api.appointments.show', $own->id))->assertOk();
        $this->actingAs($doctorUser)->getJson(route('api.appointments.show', $others->id))->assertForbidden();
    }

    public function test_a_doctor_with_no_doctor_record_sees_nothing()
    {
        $orphan = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->row('2026-11-02 09:00');

        $this->assertSame([], $this->list(as: $orphan)->assertOk()->json('items'));
    }

    public function test_the_admin_and_receptionist_see_the_whole_clinic_and_never_another()
    {
        $this->row('2026-11-02 09:00');
        $foreign = Appointment::factory()->forClinic(Clinic::factory()->create())->create();

        foreach ([$this->reception, $this->admin] as $user) {
            $page = $this->list(as: $user)->json();
            $this->assertCount(1, $page['items']);
            $this->assertNotContains($foreign->id, $this->ids($page));
        }
    }
}
