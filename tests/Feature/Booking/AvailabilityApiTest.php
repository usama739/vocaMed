<?php

namespace Tests\Feature\Booking;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AssertsShape;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

class AvailabilityApiTest extends TestCase
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
     * @param  array<string, mixed>  $query
     */
    private function slots(array $query = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->getJson(route('api.availability', [
            'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'date' => '2026-11-02', ...$query,
        ]));
    }

    private function hold(string $local = '2026-11-02 10:00', ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->postJson(route('api.holds.store'), [
            'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $this->at($local)->toIso8601String(),
        ]);
    }

    public function test_a_days_slots_have_the_shape_the_screen_is_tested_with()
    {
        $slots = $this->slots()->assertOk()->json();

        $this->assertCount(16, $slots);
        $this->assertSameShape($this->fixture('slot'), $slots[0]);
        $this->assertSame('2026-11-02T04:00:00.000Z', $slots[0]['startsAt']);
    }

    public function test_the_date_doctor_and_service_are_required_and_checked()
    {
        $this->slots(['date' => null])->assertStatus(422)->assertJsonPath('field', 'date');
        $this->slots(['date' => '02/11/2026'])->assertStatus(422)->assertJsonPath('field', 'date');
        $this->slots(['doctorId' => null])->assertStatus(422)->assertJsonPath('field', 'doctorId');
        $this->slots(['serviceId' => null])->assertStatus(422)->assertJsonPath('field', 'serviceId');
        $this->slots(['doctorId' => '01JNOSUCHDOCTOR000000000'])->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
        $this->slots(['serviceId' => '01JNOSUCHSERVICE00000000'])->assertNotFound();
    }

    public function test_a_doctor_who_is_off_a_service_that_is_off_or_not_offered_cannot_be_looked_up()
    {
        $other = Service::factory()->forClinic($this->clinic)->create(['name' => 'Other']);
        $this->slots(['serviceId' => $other->id])->assertStatus(422)->assertJsonPath('field', 'serviceId');

        $this->service->forceFill(['is_active' => false])->save();
        $this->slots()->assertStatus(422)->assertJsonPath('field', 'serviceId');
        $this->service->forceFill(['is_active' => true])->save();

        $this->doctor->forceFill(['is_active' => false])->save();
        $this->slots()->assertStatus(422)->assertJsonPath('field', 'doctorId');
    }

    public function test_another_clinics_doctor_and_service_are_not_found()
    {
        $other = Clinic::factory()->create();
        $foreignDoctor = Doctor::factory()->forClinic($other)->create();
        $foreignService = Service::factory()->forClinic($other)->create();

        $this->slots(['doctorId' => $foreignDoctor->id])->assertNotFound();
        $this->slots(['serviceId' => $foreignService->id])->assertNotFound();
    }

    public function test_the_nearest_alternatives_come_back_nearest_first()
    {
        $this->hold('2026-11-02 10:00', $this->admin)->assertCreated();

        $alternatives = $this->actingAs($this->reception)->getJson(route('api.availability.alternatives', [
            'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id, 'startsAt' => $this->at('2026-11-02 10:00')->toIso8601String(), 'count' => 2,
        ]))->assertOk()->json();

        $this->assertCount(2, $alternatives);
        $this->assertSame(['2026-11-02T04:00:00.000Z', '2026-11-02T06:00:00.000Z'], array_column($alternatives, 'startsAt'), '09:00 and 11:00: the held 10:00 and its neighbours are not offered');
        $this->assertSameShape($this->fixture('slot'), $alternatives[0]);
    }

    public function test_alternatives_need_a_time_and_a_sensible_count()
    {
        $base = ['doctorId' => $this->doctor->id, 'serviceId' => $this->service->id];

        $this->actingAs($this->reception)->getJson(route('api.availability.alternatives', $base))->assertStatus(422)->assertJsonPath('field', 'startsAt');
        $this->actingAs($this->reception)->getJson(route('api.availability.alternatives', [...$base, 'startsAt' => $this->at('2026-11-02 10:00')->toIso8601String(), 'count' => 99]))->assertStatus(422)->assertJsonPath('field', 'count');
    }

    // Holds

    public function test_a_hold_has_the_shape_the_screen_is_tested_with_and_shows_as_held_to_others_and_mine_to_me()
    {
        $held = $this->hold()->assertCreated()->json();

        $this->assertSameShape($this->fixture('slot-hold'), $held);
        $this->assertSame((string) $this->reception->id, $held['heldBy']);
        $this->assertSame('2026-11-01T10:02:00.000Z', $held['expiresAt']);

        $mine = collect($this->slots()->json())->firstWhere('startsAt', '2026-11-02T05:00:00.000Z');
        $theirs = collect($this->slots(as: $this->admin)->json())->firstWhere('startsAt', '2026-11-02T05:00:00.000Z');
        $this->assertSame(['state' => 'held', 'heldByMe' => true], ['state' => $mine['state'], 'heldByMe' => $mine['heldByMe']]);
        $this->assertSame(['state' => 'held', 'heldByMe' => false], ['state' => $theirs['state'], 'heldByMe' => $theirs['heldByMe']]);
    }

    public function test_a_second_hold_replaces_the_first_and_others_are_turned_away_with_alternatives()
    {
        $first = $this->hold('2026-11-02 10:00')->assertCreated()->json('id');
        $second = $this->hold('2026-11-02 14:00')->assertCreated()->json('id');

        $this->assertNotSame($first, $second);
        $this->assertCount(1, $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->json());

        $this->hold('2026-11-02 14:00', $this->admin)->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE')->assertJsonCount(3, 'alternatives');
        $this->hold('2026-11-02 10:00', $this->admin)->assertCreated();
    }

    public function test_a_hold_on_an_unavailable_time_is_refused()
    {
        $this->hold('2026-11-02 10:10')->assertStatus(409)->assertJsonPath('code', 'SLOT_UNAVAILABLE');
        $this->hold('2026-11-08 10:00')->assertStatus(409);
    }

    public function test_a_hold_is_released_by_its_holder_only()
    {
        $id = $this->hold()->json('id');

        $this->actingAs($this->admin)->deleteJson(route('api.holds.destroy', $id))->assertOk();
        $this->assertCount(1, $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->json());

        $this->actingAs($this->reception)->deleteJson(route('api.holds.destroy', $id))->assertOk()->assertExactJson(['ok' => true]);
        $this->assertSame([], $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->json());
    }

    public function test_holds_are_listed_by_clinic_local_date()
    {
        $this->hold('2026-11-02 10:00')->assertCreated();
        $this->hold('2026-11-03 10:00', $this->admin)->assertCreated();

        $this->assertCount(1, $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->assertOk()->json());
        $this->assertCount(1, $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-03']))->json());
        $this->assertSame([], $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-04']))->json());
        $this->actingAs($this->reception)->getJson(route('api.holds.index'))->assertStatus(422)->assertJsonPath('field', 'date');
    }

    public function test_a_hold_runs_out_by_itself()
    {
        $this->hold()->assertCreated();
        Carbon::setTestNow(now()->addSeconds(121));

        $this->assertSame([], $this->actingAs($this->reception)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->json());
        $this->assertSame('free', collect($this->slots(as: $this->admin)->json())->firstWhere('startsAt', '2026-11-02T05:00:00.000Z')['state']);
    }

    public function test_only_the_front_desk_may_look_up_or_hold_slots()
    {
        $doctorUser = User::factory()->doctor()->forClinic($this->clinic)->create();

        $this->slots(as: $doctorUser)->assertForbidden();
        $this->hold(as: $doctorUser)->assertForbidden();
        $this->actingAs($doctorUser)->getJson(route('api.holds.index', ['date' => '2026-11-02']))->assertForbidden();

        $this->slots(as: $this->admin)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson(route('api.availability', ['doctorId' => 'x', 'serviceId' => 'y', 'date' => '2026-11-02']))->assertUnauthorized();
    }
}
