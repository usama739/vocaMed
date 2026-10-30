<?php

namespace Tests\Feature\Doctor;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class AvailabilityTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $user;

    private Doctor $doctor;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create();
        $this->user = User::factory()->doctor()->forClinic($this->clinic)->create();
        $this->doctor = Doctor::factory()->forUser($this->user)->create(['display_name' => 'Dr. Mine']);
    }

    /**
     * @return array<string, mixed>
     */
    private function draft(): array
    {
        return ['days' => array_map(fn (int $w) => ['weekday' => $w, 'on' => $w >= 1 && $w <= 5, 'start' => '09:00', 'end' => '17:00', 'lunch' => true], [1, 2, 3, 4, 5, 6, 0]), 'timeOff' => [], 'blocked' => []];
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $draft = $this->draft();
        $draft['timeOff'] = [['id' => null, 'startDate' => '2026-11-02', 'endDate' => '2026-11-04', 'reason' => 'Conference']];
        $draft['blocked'] = [['weekday' => 1, 'time' => '10:00']];
        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $draft)->assertOk();

        $view = $this->actingAs($this->user)->getJson(route('doctor.availability'))->assertOk()->json();

        $this->assertSameShape($this->fixture('doctor-availability-view'), $view);
        $this->assertSame('Dr. Mine', $view['doctor']['name']);
        $this->assertSame((string) $this->user->id, $view['doctor']['userId']);
    }

    public function test_a_doctor_edits_their_own_availability_and_the_save_is_audited_with_them_as_actor()
    {
        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $this->draft())->assertOk()->assertExactJson(['ok' => true]);

        $this->assertSame(['availability.updated'], DB::table('audit_logs')->pluck('action')->all());
        $this->assertSame((string) $this->user->id, DB::table('audit_logs')->value('actor_id'));
        $this->assertSame($this->doctor->id, DB::table('audit_logs')->value('subject_id'));

        $days = $this->actingAs($this->user)->getJson(route('doctor.availability'))->json('draft.days');
        $this->assertTrue($days[0]['lunch']);
        $this->assertFalse($days[5]['on']);
    }

    public function test_saving_what_is_already_saved_writes_no_entry()
    {
        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $this->draft())->assertOk();
        DB::table('audit_logs')->delete();

        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $this->draft())->assertOk();

        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    public function test_the_preview_uses_the_booking_rules_and_saves_nothing()
    {
        $preview = $this->actingAs($this->user)->postJson(route('doctor.availability.preview'), $this->draft())->assertOk()->json();

        $this->assertSame([14, 14, 14, 14, 14, 0, 0], $preview['slotsPerWeekday']);
        $this->assertSame(70, $preview['total']);
        $this->assertSame(0, DB::table('schedule_rules')->count());
    }

    public function test_a_doctor_only_ever_touches_their_own_record()
    {
        $colleagueUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $colleague = Doctor::factory()->forUser($colleagueUser)->create(['display_name' => 'Dr. Colleague']);

        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $this->draft())->assertOk();

        $this->assertSame(0, DB::table('schedule_rules')->where('doctor_id', $colleague->id)->count());
        $this->assertSame('Dr. Mine', $this->actingAs($this->user)->getJson(route('doctor.availability'))->json('doctor.name'));
        // The "own only" rule itself: mine yes, a colleague's no.
        $this->assertTrue(Gate::forUser($this->user)->allows('availability.edit', $this->doctor));
        $this->assertFalse(Gate::forUser($this->user)->allows('availability.edit', $colleague));
    }

    public function test_the_request_cannot_name_another_doctor()
    {
        $colleagueUser = User::factory()->doctor()->forClinic($this->clinic)->create();
        $colleague = Doctor::factory()->forUser($colleagueUser)->create();

        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), [...$this->draft(), 'doctor_id' => $colleague->id, 'doctorId' => $colleague->id])->assertOk();

        $this->assertSame(0, DB::table('schedule_rules')->where('doctor_id', $colleague->id)->count());
        $this->assertGreaterThan(0, DB::table('schedule_rules')->where('doctor_id', $this->doctor->id)->count());
    }

    public function test_a_doctor_login_with_no_doctor_record_gets_not_found()
    {
        $orphan = User::factory()->doctor()->forClinic($this->clinic)->create();

        $this->actingAs($orphan)->getJson(route('doctor.availability'))->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
        $this->actingAs($orphan)->putJson(route('doctor.availability.save'), $this->draft())->assertNotFound();
    }

    public function test_bad_input_is_refused_on_the_field_the_page_shows()
    {
        $bad = $this->draft();
        $bad['days'][0]['start'] = '18:00';

        $this->actingAs($this->user)->putJson(route('doctor.availability.save'), $bad)->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', 'days');
        $this->actingAs($this->user)->postJson(route('doctor.availability.preview'), $bad)->assertStatus(422);
        $this->assertSame(0, DB::table('schedule_rules')->count());
    }

    public function test_the_other_roles_cannot_use_the_doctors_page_and_nobody_signed_in_is_asked_to_sign_in()
    {
        foreach ([Role::ClinicAdmin, Role::Receptionist] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('doctor.availability'))->assertForbidden();
            $this->actingAs($user)->putJson(route('doctor.availability.save'), $this->draft())->assertForbidden();
        }

        $this->app['auth']->forgetGuards();
        $this->getJson(route('doctor.availability'))->assertUnauthorized();
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->user)->get(route('doctor.availability'))->assertOk()->assertInertia(fn ($page) => $page->component('doctor/availability'));
    }
}
