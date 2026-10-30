<?php

namespace Tests\Feature\Admin;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class ServicesTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create();
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function input(array $overrides = []): array
    {
        return array_merge(['name' => 'Check-up', 'durationMin' => 30, 'bufferMin' => 10, 'doctorIds' => []], $overrides);
    }

    private function create(array $input)
    {
        return $this->actingAs($this->admin)->postJson(route('admin.services.store'), $input);
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $doctor = Doctor::factory()->forClinic($this->clinic)->create();
        $this->create($this->input(['doctorIds' => [$doctor->id]]))->assertCreated();

        $this->assertSameShape(
            $this->fixture('admin-services-view'),
            $this->actingAs($this->admin)->getJson(route('admin.services'))->assertOk()->json(),
        );
    }

    public function test_a_service_is_created_active_and_offered_by_the_chosen_doctors()
    {
        $a = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. A']);
        $b = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. B']);

        $created = $this->create($this->input(['name' => '  Check-up ', 'doctorIds' => [$a->id, $b->id]]))
            ->assertCreated()->assertJson(['name' => 'Check-up', 'durationMin' => 30, 'bufferMin' => 10, 'active' => true])->json();

        $view = $this->actingAs($this->admin)->getJson(route('admin.services'))->json();

        $this->assertSame($created['id'], $view['services'][0]['service']['id']);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $view['services'][0]['doctorIds']);
        $this->assertSame([$created['id']], $view['doctors'][0]['serviceIds']);
    }

    public function test_updating_replaces_the_name_times_and_doctors()
    {
        $a = Doctor::factory()->forClinic($this->clinic)->create();
        $b = Doctor::factory()->forClinic($this->clinic)->create();
        $id = $this->create($this->input(['doctorIds' => [$a->id]]))->json('id');

        $this->actingAs($this->admin)
            ->putJson(route('admin.services.update', $id), $this->input(['name' => 'Follow-up', 'durationMin' => 15, 'bufferMin' => 0, 'doctorIds' => [$b->id]]))
            ->assertOk()->assertJson(['name' => 'Follow-up', 'durationMin' => 15, 'bufferMin' => 0]);

        $row = $this->actingAs($this->admin)->getJson(route('admin.services'))->json('services.0');
        $this->assertSame([$b->id], $row['doctorIds']);
    }

    public function test_a_service_can_be_turned_off_and_on_and_only_a_change_is_audited()
    {
        $id = $this->create($this->input())->json('id');
        DB::table('audit_logs')->delete();

        $this->actingAs($this->admin)->patchJson(route('admin.services.toggle', $id), ['active' => false])->assertOk()->assertJson(['active' => false]);
        $this->actingAs($this->admin)->patchJson(route('admin.services.toggle', $id), ['active' => false])->assertOk();
        $this->actingAs($this->admin)->patchJson(route('admin.services.toggle', $id), ['active' => true])->assertOk()->assertJson(['active' => true]);

        $this->assertSame(['service.deactivated', 'service.activated'], $this->actions());
    }

    public function test_creating_and_updating_are_audited_with_the_name_and_the_actor()
    {
        $id = $this->create($this->input())->json('id');
        $this->actingAs($this->admin)->putJson(route('admin.services.update', $id), $this->input(['name' => 'Check-up plus']))->assertOk();

        $this->assertSame(['service.created', 'service.updated'], $this->actions());
        $row = DB::table('audit_logs')->where('action', 'service.updated')->first();
        $this->assertSame((string) $this->admin->id, $row->actor_id);
        $this->assertSame($id, $row->subject_id);
        $this->assertSame(['name' => 'Check-up plus'], json_decode($row->meta, true));
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badInputs(): array
    {
        return [
            'no name' => [['name' => '  '], 'name'],
            'name too long' => [['name' => str_repeat('a', 121)], 'name'],
            'duration too short' => [['durationMin' => 0], 'durationMin'],
            'duration too long' => [['durationMin' => 185], 'durationMin'],
            'duration not a step of 5' => [['durationMin' => 32], 'durationMin'],
            'buffer too long' => [['bufferMin' => 65], 'bufferMin'],
            'buffer not a step of 5' => [['bufferMin' => 7], 'bufferMin'],
            'a doctor twice' => [['doctorIds' => ['x', 'x']], 'doctorIds.0'],
            'a doctor that does not exist' => [['doctorIds' => ['01JNOSUCHDOCTOR000000000']], 'doctorIds.0'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badInputs')]
    public function test_bad_input_is_refused_on_its_field_and_nothing_is_saved(array $overrides, string $field)
    {
        $this->create($this->input($overrides))
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonValidationErrorFor($field, 'errors');

        $this->assertSame(0, Service::query()->count());
        $this->assertSame([], $this->actions());
    }

    public function test_a_name_cannot_be_used_twice_in_a_clinic_whatever_the_letter_case()
    {
        $this->create($this->input(['name' => 'Check-up']))->assertCreated();

        $this->create($this->input(['name' => 'CHECK-UP']))
            ->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_NAME')->assertJsonPath('field', 'name');
    }

    public function test_a_service_can_be_saved_again_under_its_own_name_but_not_under_anothers()
    {
        $one = $this->create($this->input(['name' => 'One']))->json('id');
        $this->create($this->input(['name' => 'Two']))->assertCreated();

        $this->actingAs($this->admin)->putJson(route('admin.services.update', $one), $this->input(['name' => 'One', 'durationMin' => 45]))->assertOk();
        $this->actingAs($this->admin)->putJson(route('admin.services.update', $one), $this->input(['name' => 'two']))->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_NAME');
    }

    public function test_another_clinic_may_use_the_same_name()
    {
        $other = Clinic::factory()->create();
        $otherAdmin = User::factory()->clinicAdmin()->forClinic($other)->create();

        $this->create($this->input())->assertCreated();
        $this->actingAs($otherAdmin)->postJson(route('admin.services.store'), $this->input())->assertCreated();
    }

    public function test_another_clinics_doctor_cannot_be_attached()
    {
        $foreign = Doctor::factory()->forClinic(Clinic::factory()->create())->create();

        $this->create($this->input(['doctorIds' => [$foreign->id]]))
            ->assertStatus(422)->assertJsonValidationErrorFor('doctorIds.0', 'errors');

        $this->assertSame(0, DB::table('doctor_service')->count());
    }

    public function test_another_clinics_service_is_not_found_to_read_change_or_switch()
    {
        $foreign = Service::factory()->forClinic(Clinic::factory()->create())->create(['name' => 'Foreign']);

        $this->actingAs($this->admin)->putJson(route('admin.services.update', $foreign->id), $this->input())->assertNotFound();
        $this->actingAs($this->admin)->patchJson(route('admin.services.toggle', $foreign->id), ['active' => false])->assertNotFound();
        $this->assertTrue($foreign->fresh()->is_active);
        $this->assertSame([], $this->actingAs($this->admin)->getJson(route('admin.services'))->json('services'));
    }

    public function test_only_the_clinic_admin_may_read_or_change_services()
    {
        $service = Service::factory()->forClinic($this->clinic)->create();

        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('admin.services'))->assertForbidden();
            $this->actingAs($user)->postJson(route('admin.services.store'), $this->input())->assertForbidden();
            $this->actingAs($user)->putJson(route('admin.services.update', $service->id), $this->input())->assertForbidden();
            $this->actingAs($user)->patchJson(route('admin.services.toggle', $service->id), ['active' => false])->assertForbidden();
        }

        $this->assertTrue($service->fresh()->is_active);
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->admin)->get(route('admin.services'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/services'));
    }
}
