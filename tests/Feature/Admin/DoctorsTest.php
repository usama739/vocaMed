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

class DoctorsTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    private Service $service;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create();
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
        $this->service = Service::factory()->forClinic($this->clinic)->create(['name' => 'Check-up']);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function body(array $overrides = []): array
    {
        $days = array_map(fn (int $w) => ['weekday' => $w, 'on' => $w >= 1 && $w <= 5, 'start' => '09:00', 'end' => $w >= 1 && $w <= 5 ? '17:00' : '13:00', 'lunch' => $w === 1], [1, 2, 3, 4, 5, 6, 0]);

        return array_replace_recursive([
            'profile' => ['name' => 'Dr. Sana Malik', 'specialty' => 'General physician', 'languages' => ['en', 'ur'], 'serviceIds' => [$this->service->id], 'active' => true],
            'availability' => ['days' => $days, 'timeOff' => [], 'blocked' => []],
        ], $overrides);
    }

    private function create(array $body)
    {
        return $this->actingAs($this->admin)->postJson(route('admin.doctors.store'), $body);
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    private function profile(string $id): array
    {
        return $this->actingAs($this->admin)->getJson(route('admin.doctor', $id))->assertOk()->json();
    }

    public function test_the_read_models_have_the_shape_the_screens_are_tested_with()
    {
        $body = $this->body();
        $body['availability']['timeOff'] = [['id' => null, 'startDate' => '2026-11-02', 'endDate' => '2026-11-04', 'reason' => 'Conference']];
        $body['availability']['blocked'] = [['weekday' => 1, 'time' => '10:00']];
        $id = $this->create($body)->assertCreated()->json('id');

        $this->assertSameShape($this->fixture('admin-doctors-view'), $this->actingAs($this->admin)->getJson(route('admin.doctors'))->assertOk()->json());
        $this->assertSameShape($this->fixture('admin-doctor-view'), $this->profile($id));
    }

    public function test_a_doctor_is_created_with_services_and_availability_in_one_save()
    {
        $created = $this->create($this->body())->assertCreated()->json();

        $this->assertSame('Dr. Sana Malik', $created['name']);
        $this->assertSame([$this->service->id], $created['serviceIds']);
        $this->assertNull($created['userId']);
        $this->assertTrue($created['active']);

        $view = $this->profile($created['id']);
        $this->assertSame(['en', 'ur'], $view['profile']['languages']);
        $this->assertSame([true, true, true, true, true, false, false], array_column($view['draft']['days'], 'on'));
        $this->assertTrue($view['draft']['days'][0]['lunch']);
        $this->assertSame(['doctor.created'], $this->actions());
    }

    public function test_the_blank_form_starts_on_weekdays_with_every_active_service_ticked()
    {
        Service::factory()->forClinic($this->clinic)->inactive()->create(['name' => 'Retired']);

        $view = $this->actingAs($this->admin)->getJson(route('admin.doctor', 'new'))->assertOk()->json();

        $this->assertNull($view['id']);
        $this->assertSame('', $view['profile']['name']);
        $this->assertSame([$this->service->id], $view['profile']['serviceIds']);
        $this->assertSame(['en', 'ur'], $view['profile']['languages']);
        $this->assertSame(16, $view['preview']['slotsPerWeekday'][0]);
        $this->assertSame(['state' => 'none', 'email' => null, 'invitationId' => null], $view['signIn']);
        $this->assertCount(2, $view['services']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badBodies(): array
    {
        $days = fn (callable $change) => ['availability' => ['days' => $change(array_map(fn (int $w) => ['weekday' => $w, 'on' => true, 'start' => '09:00', 'end' => '17:00', 'lunch' => false], [1, 2, 3, 4, 5, 6, 0]))]];

        return [
            'no name' => [['profile' => ['name' => '  ']], 'name'],
            'name too long' => [['profile' => ['name' => str_repeat('a', 121)]], 'name'],
            'a language that is not offered' => [['profile' => ['languages' => ['en', 'fr']]], 'languages'],
            'the same language twice' => [['profile' => ['languages' => ['en', 'en']]], 'languages'],
            'a service that does not exist' => [['profile' => ['serviceIds' => ['01JNOSUCHSERVICE00000000']]], 'serviceIds'],
            'a time that is not on the half hour' => [$days(function (array $d) {
                $d[0]['start'] = '09:10';

                return $d;
            }), 'days'],
            'a time outside 06:00 to 20:00' => [$days(function (array $d) {
                $d[0]['end'] = '21:00';

                return $d;
            }), 'days'],
            'a day that ends before it starts' => [$days(function (array $d) {
                $d[1]['start'] = '17:00';
                $d[1]['end'] = '09:00';

                return $d;
            }), 'days'],
            'the same weekday twice' => [$days(function (array $d) {
                $d[1]['weekday'] = 1;

                return $d;
            }), 'days'],
            'leave that ends before it starts' => [['availability' => ['timeOff' => [['id' => null, 'startDate' => '2026-11-05', 'endDate' => '2026-11-01', 'reason' => '']]]], 'timeOff'],
            'the same half hour closed twice' => [['availability' => ['blocked' => [['weekday' => 1, 'time' => '10:00'], ['weekday' => 1, 'time' => '10:00']]]], 'blocked'],
            'a blocked time that is not on the half hour' => [['availability' => ['blocked' => [['weekday' => 1, 'time' => '10:15']]]], 'blocked'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badBodies')]
    public function test_bad_input_is_refused_on_the_field_the_form_shows_and_nothing_is_saved(array $overrides, string $field)
    {
        $this->create($this->body($overrides))
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', $field);

        $this->assertSame(0, Doctor::query()->count());
        $this->assertSame(0, DB::table('schedule_rules')->count());
        $this->assertSame([], $this->actions());
    }

    public function test_another_clinics_service_cannot_be_offered()
    {
        $foreign = Service::factory()->forClinic(Clinic::factory()->create())->create();

        $this->create($this->body(['profile' => ['serviceIds' => [$foreign->id]]]))->assertStatus(422)->assertJsonPath('field', 'serviceIds');
        $this->assertSame(0, DB::table('doctor_service')->count());
    }

    public function test_saving_changes_the_profile_services_and_availability_and_audits_each_kind_of_change()
    {
        $id = $this->create($this->body())->json('id');
        $other = Service::factory()->forClinic($this->clinic)->create(['name' => 'Follow-up']);
        DB::table('audit_logs')->delete();

        $change = $this->body(['profile' => ['name' => 'Dr. Sana M.', 'serviceIds' => [$other->id]]]);
        $change['availability']['days'][1]['end'] = '15:00';

        $this->actingAs($this->admin)->putJson(route('admin.doctors.update', $id), $change)->assertOk()->assertJson(['name' => 'Dr. Sana M.', 'serviceIds' => [$other->id]]);

        $this->assertSame(['doctor.updated', 'availability.updated'], $this->actions());
        $this->assertSame('15:00', $this->profile($id)['draft']['days'][1]['end']);
    }

    public function test_saving_the_same_values_writes_no_entries()
    {
        $id = $this->create($this->body())->json('id');
        DB::table('audit_logs')->delete();

        $this->actingAs($this->admin)->putJson(route('admin.doctors.update', $id), $this->body())->assertOk();

        $this->assertSame([], $this->actions());
    }

    public function test_a_change_to_availability_alone_is_audited_as_availability()
    {
        $id = $this->create($this->body())->json('id');
        DB::table('audit_logs')->delete();

        $change = $this->body();
        $change['availability']['blocked'] = [['weekday' => 2, 'time' => '11:00']];
        $this->actingAs($this->admin)->putJson(route('admin.doctors.update', $id), $change)->assertOk();

        $this->assertSame(['availability.updated'], $this->actions());
    }

    public function test_a_doctor_can_be_hidden_from_booking_and_shown_again_without_losing_anything()
    {
        $id = $this->create($this->body())->json('id');
        DB::table('audit_logs')->delete();

        $this->actingAs($this->admin)->patchJson(route('admin.doctors.toggle', $id), ['active' => false])->assertOk()->assertJson(['active' => false]);
        $this->actingAs($this->admin)->patchJson(route('admin.doctors.toggle', $id), ['active' => false])->assertOk();
        $view = $this->profile($id);
        $this->assertFalse($view['profile']['active']);
        $this->assertSame([$this->service->id], $view['profile']['serviceIds']);
        $this->assertSame(16, $view['preview']['slotsPerWeekday'][1]);

        $this->actingAs($this->admin)->patchJson(route('admin.doctors.toggle', $id), ['active' => true])->assertOk()->assertJson(['active' => true]);
        $this->assertSame(['doctor.deactivated', 'doctor.activated'], $this->actions());
    }

    public function test_the_list_is_searched_by_name_or_specialty_and_filtered_by_status()
    {
        $this->create($this->body(['profile' => ['name' => 'Dr. Ayesha', 'specialty' => 'Dentist']]))->assertCreated();
        $inactive = $this->create($this->body(['profile' => ['name' => 'Dr. Bilal', 'specialty' => 'Pediatrician']]))->json('id');
        $this->actingAs($this->admin)->patchJson(route('admin.doctors.toggle', $inactive), ['active' => false]);

        $names = fn (array $query) => array_column(array_column($this->actingAs($this->admin)->getJson(route('admin.doctors', $query))->json('rows'), 'doctor'), 'name');

        $this->assertSame(['Dr. Ayesha', 'Dr. Bilal'], $names([]));
        $this->assertSame(['Dr. Ayesha'], $names(['status' => 'active']));
        $this->assertSame(['Dr. Bilal'], $names(['status' => 'inactive']));
        $this->assertSame(['Dr. Ayesha'], $names(['q' => 'dent']));
        $this->assertSame(['Dr. Bilal'], $names(['q' => 'BILAL']));
        $this->assertSame([], $names(['q' => 'nobody']));
        $this->assertSame(2, $this->actingAs($this->admin)->getJson(route('admin.doctors', ['q' => 'dent']))->json('total'));
    }

    public function test_the_preview_counts_slots_by_the_booking_rules_and_saves_nothing()
    {
        $id = $this->create($this->body())->json('id');
        $draft = $this->body()['availability'];
        $draft['blocked'] = [['weekday' => 2, 'time' => '10:00']];

        $preview = $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', $id), $draft)->assertOk()->json();

        $this->assertSame([14, 15, 16, 16, 16, 0, 0], $preview['slotsPerWeekday']);
        $this->assertSame(77, $preview['total']);
        $this->assertSame([], $preview['affected']);
        $this->assertSame([], $this->profile($id)['draft']['blocked']);
    }

    public function test_the_preview_works_for_a_doctor_who_does_not_exist_yet()
    {
        $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', 'new'), $this->body()['availability'])
            ->assertOk()->assertJsonPath('total', 78);
    }

    public function test_business_hours_are_the_outer_limit_in_the_preview()
    {
        $this->clinic->forceFill(['settings' => ['businessHours' => [['weekday' => 1, 'open' => '10:00', 'close' => '12:00']]]])->save();

        $preview = $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', 'new'), $this->body()['availability'])->json();

        $this->assertSame([4, 0, 0, 0, 0, 0, 0], $preview['slotsPerWeekday']);
    }

    public function test_the_admin_can_save_any_doctors_availability_and_leave_keeps_its_ids()
    {
        $id = $this->create($this->body(['availability' => ['timeOff' => [['id' => null, 'startDate' => '2026-11-02', 'endDate' => '2026-11-03', 'reason' => 'Conference']]]]))->json('id');
        $kept = $this->profile($id)['draft']['timeOff'][0]['id'];
        DB::table('audit_logs')->delete();

        $draft = $this->body()['availability'];
        $draft['timeOff'] = [['id' => $kept, 'startDate' => '2026-11-02', 'endDate' => '2026-11-05', 'reason' => 'Longer'], ['id' => null, 'startDate' => '2026-12-01', 'endDate' => '2026-12-01', 'reason' => '']];
        $this->actingAs($this->admin)->putJson(route('admin.doctors.availability', $id), $draft)->assertOk()->assertExactJson(['ok' => true]);

        $offs = $this->profile($id)['draft']['timeOff'];
        $this->assertCount(2, $offs);
        $this->assertSame($kept, $offs[0]['id']);
        $this->assertSame('2026-11-05', $offs[0]['endDate']);
        $this->assertSame(['availability.updated'], $this->actions());
    }

    public function test_lunch_comes_back_on_and_a_day_ending_in_lunch_comes_back_as_it_will_be_booked()
    {
        $id = $this->create($this->body())->json('id');
        $this->assertTrue($this->profile($id)['draft']['days'][0]['lunch']);

        $draft = $this->body()['availability'];
        $draft['days'][1] = ['weekday' => 2, 'on' => true, 'start' => '09:00', 'end' => '13:30', 'lunch' => true];
        $this->actingAs($this->admin)->putJson(route('admin.doctors.availability', $id), $draft)->assertOk();

        $day = $this->profile($id)['draft']['days'][1];
        $this->assertSame('13:00', $day['end']);
        $this->assertFalse($day['lunch']);
    }

    public function test_another_clinics_doctor_is_not_found_to_read_change_hide_or_preview()
    {
        $foreign = Doctor::factory()->forClinic(Clinic::factory()->create())->create(['display_name' => 'Dr. Foreign']);

        $this->actingAs($this->admin)->getJson(route('admin.doctor', $foreign->id))->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
        $this->actingAs($this->admin)->putJson(route('admin.doctors.update', $foreign->id), $this->body())->assertNotFound();
        $this->actingAs($this->admin)->patchJson(route('admin.doctors.toggle', $foreign->id), ['active' => false])->assertNotFound();
        $this->actingAs($this->admin)->putJson(route('admin.doctors.availability', $foreign->id), $this->body()['availability'])->assertNotFound();
        $this->actingAs($this->admin)->postJson(route('admin.doctors.availability.preview', $foreign->id), $this->body()['availability'])->assertNotFound();
        $this->assertTrue($foreign->fresh()->is_active);
        $this->assertSame([], $this->actingAs($this->admin)->getJson(route('admin.doctors'))->json('rows'));
    }

    public function test_only_the_clinic_admin_may_use_the_doctor_screens()
    {
        $doctor = Doctor::factory()->forClinic($this->clinic)->create();

        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('admin.doctors'))->assertForbidden();
            $this->actingAs($user)->getJson(route('admin.doctor', $doctor->id))->assertForbidden();
            $this->actingAs($user)->postJson(route('admin.doctors.store'), $this->body())->assertForbidden();
            $this->actingAs($user)->putJson(route('admin.doctors.update', $doctor->id), $this->body())->assertForbidden();
            $this->actingAs($user)->patchJson(route('admin.doctors.toggle', $doctor->id), ['active' => false])->assertForbidden();
        }

        $this->assertSame(1, Doctor::query()->count());
    }

    public function test_the_pages_still_render_for_a_browser()
    {
        $doctor = Doctor::factory()->forClinic($this->clinic)->create();

        $this->actingAs($this->admin)->get(route('admin.doctors'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/doctors'));
        $this->actingAs($this->admin)->get(route('admin.doctor', $doctor->id))->assertOk()->assertInertia(fn ($page) => $page->component('admin/doctor')->where('id', $doctor->id));
        $this->actingAs($this->admin)->get(route('admin.doctor', 'new'))->assertOk();
    }
}
