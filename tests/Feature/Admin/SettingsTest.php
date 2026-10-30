<?php

namespace Tests\Feature\Admin;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create(['name' => 'Alpha Clinic', 'country' => 'PK', 'timezone' => 'Asia/Karachi']);
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function draft(array $overrides = []): array
    {
        return array_replace_recursive([
            'clinic' => ['name' => 'Alpha Clinic', 'phone' => '0300 1234567', 'address' => '12 Main Road', 'timezone' => 'Asia/Karachi', 'defaultLocale' => 'en'],
            'settings' => [
                'businessHours' => [['weekday' => 1, 'open' => '09:00', 'close' => '17:00'], ['weekday' => 2, 'open' => '09:30', 'close' => '13:00']],
                'holidays' => [['date' => '2026-11-20', 'name' => 'Public holiday']],
                'reminderHoursBefore' => [2, 24],
                'cancellationWindowHours' => 4,
                'rescheduleRequiresApproval' => true,
                'voiceEnabled' => false,
                'voiceAudioRetentionDays' => 0,
            ],
        ], $overrides);
    }

    private function save(array $draft)
    {
        return $this->actingAs($this->admin)->putJson(route('admin.settings.update'), $draft);
    }

    private function sections(): array
    {
        return DB::table('audit_logs')->where('action', 'settings.updated')->get()
            ->map(fn ($row) => json_decode($row->meta, true)['section'])->sort()->values()->all();
    }

    public function test_a_new_clinic_starts_with_sensible_defaults()
    {
        $view = $this->actingAs($this->admin)->getJson(route('admin.settings'))->assertOk()->json();

        $this->assertSame('', $view['clinic']['phone']);
        $this->assertSame('+92', $view['clinic']['phoneCountryCode']);
        $this->assertSame([1, 2, 3, 4, 5, 6], array_column($view['settings']['businessHours'], 'weekday'));
        $this->assertSame([24, 2], $view['settings']['reminderHoursBefore']);
        $this->assertSame(4, $view['settings']['cancellationWindowHours']);
        $this->assertFalse($view['settings']['voiceEnabled']);
        $this->assertSame([], $view['settings']['holidays']);
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $this->save($this->draft())->assertOk();

        $this->assertSameShape(
            $this->fixture('admin-settings-view'),
            $this->actingAs($this->admin)->getJson(route('admin.settings'))->json(),
        );
    }

    public function test_saving_stores_everything_and_the_page_reads_it_back()
    {
        $this->save($this->draft())->assertOk()->assertExactJson(['ok' => true]);

        $view = $this->actingAs($this->admin)->getJson(route('admin.settings'))->json();

        $this->assertSame('+923001234567', $view['clinic']['phone']);
        $this->assertSame('12 Main Road', $view['clinic']['address']);
        $this->assertSame([['weekday' => 1, 'open' => '09:00', 'close' => '17:00'], ['weekday' => 2, 'open' => '09:30', 'close' => '13:00']], $view['settings']['businessHours']);
        $this->assertSame([24, 2], $view['settings']['reminderHoursBefore']);
        $this->assertTrue($view['settings']['rescheduleRequiresApproval']);
        $this->assertSame([['date' => '2026-11-20', 'name' => 'Public holiday']], $view['settings']['holidays']);
    }

    public function test_holidays_are_replaced_as_a_list()
    {
        $this->save($this->draft())->assertOk();
        $this->save($this->draft(['settings' => ['holidays' => [['date' => '2026-12-25', 'name' => 'Christmas'], ['date' => '2026-12-01', 'name' => 'Local day']]]]))->assertOk();

        $holidays = $this->actingAs($this->admin)->getJson(route('admin.settings'))->json('settings.holidays');

        $this->assertSame(['2026-12-01', '2026-12-25'], array_column($holidays, 'date'));
    }

    public function test_an_empty_phone_is_allowed_and_means_none()
    {
        $this->save($this->draft())->assertOk();
        $this->save($this->draft(['clinic' => ['phone' => '', 'address' => '']]))->assertOk();

        $clinic = $this->actingAs($this->admin)->getJson(route('admin.settings'))->json('clinic');
        $this->assertSame('', $clinic['phone']);
        $this->assertSame('', $clinic['address']);
    }

    public function test_an_invalid_phone_is_refused_on_the_phone_field()
    {
        $this->save($this->draft(['clinic' => ['phone' => '12']]))
            ->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE')->assertJsonPath('field', 'phone');
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badDrafts(): array
    {
        return [
            'no name' => [['clinic' => ['name' => '   ']], 'name'],
            'unknown timezone' => [['clinic' => ['timezone' => 'Mars/Base']], 'timezone'],
            'unknown language' => [['clinic' => ['defaultLocale' => 'fr']], 'defaultLocale'],
            'hours off the half hour' => [['settings' => ['businessHours' => [['weekday' => 1, 'open' => '09:10', 'close' => '17:00']]]], 'settings.businessHours.0.open'],
            'closing before opening' => [['settings' => ['businessHours' => [['weekday' => 1, 'open' => '17:00', 'close' => '09:00']]]], 'settings.businessHours.0.close'],
            'the same weekday twice' => [['settings' => ['businessHours' => [['weekday' => 1, 'open' => '09:00', 'close' => '17:00'], ['weekday' => 1, 'open' => '10:00', 'close' => '12:00']]]], 'settings.businessHours.0.weekday'],
            'a reminder that is not offered' => [['settings' => ['reminderHoursBefore' => [24, 3]]], 'settings.reminderHoursBefore.1'],
            'the same reminder twice' => [['settings' => ['reminderHoursBefore' => [24, 24]]], 'settings.reminderHoursBefore.0'],
            'a cancellation window that is not offered' => [['settings' => ['cancellationWindowHours' => 3]], 'settings.cancellationWindowHours'],
            'retention that is not offered' => [['settings' => ['voiceAudioRetentionDays' => 14]], 'settings.voiceAudioRetentionDays'],
            'a holiday without a name' => [['settings' => ['holidays' => [['date' => '2026-11-20', 'name' => '']]]], 'settings.holidays.0.name'],
            'two holidays on one date' => [['settings' => ['holidays' => [['date' => '2026-11-20', 'name' => 'A'], ['date' => '2026-11-20', 'name' => 'B']]]], 'settings.holidays.0.date'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badDrafts')]
    public function test_a_bad_draft_is_refused_on_its_field_and_nothing_is_saved(array $overrides, string $field)
    {
        $this->save($this->draft($overrides))
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonValidationErrorFor($field, 'errors');

        $this->assertSame('', $this->actingAs($this->admin)->getJson(route('admin.settings'))->json('clinic.address'));
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'settings.updated')->count());
    }

    public function test_the_error_on_a_detail_names_the_plain_field_the_page_expects()
    {
        $this->save($this->draft(['clinic' => ['name' => '']]))->assertStatus(422)->assertJsonPath('field', 'name');
    }

    public function test_no_closing_day_means_the_clinic_is_closed_that_day()
    {
        $draft = $this->draft();
        $draft['settings']['businessHours'] = [];
        $this->save($draft)->assertOk();

        $this->assertSame([], $this->actingAs($this->admin)->getJson(route('admin.settings'))->json('settings.businessHours'));
    }

    public function test_each_change_is_audited_by_the_section_it_belongs_to_and_an_unchanged_save_is_not()
    {
        $this->save($this->draft())->assertOk();
        DB::table('audit_logs')->delete();

        $this->save($this->draft())->assertOk();
        $this->assertSame([], $this->sections(), 'Saving the same values must not write entries.');

        $this->save($this->draft(['clinic' => ['name' => 'Alpha Care'], 'settings' => ['voiceEnabled' => true, 'holidays' => [['date' => '2026-11-21', 'name' => 'Moved']]]]))->assertOk();

        $this->assertSame(['details', 'holidays', 'voice'], $this->sections());
    }

    public function test_the_audit_entry_names_the_actor_and_never_the_values()
    {
        $this->save($this->draft(['clinic' => ['phone' => '0301 9999999']]))->assertOk();

        $row = DB::table('audit_logs')->where('action', 'settings.updated')->first();

        $this->assertSame((string) $this->admin->id, $row->actor_id);
        $this->assertStringNotContainsString('9999999', (string) $row->meta);
    }

    public function test_only_the_clinic_admin_may_read_or_save_settings()
    {
        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('admin.settings'))->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
            $this->actingAs($user)->putJson(route('admin.settings.update'), $this->draft())->assertForbidden();
        }

        $this->assertSame('Alpha Clinic', $this->clinic->fresh()->name);
    }

    public function test_saving_changes_only_the_signed_in_admins_own_clinic()
    {
        $other = Clinic::factory()->create(['name' => 'Beta Clinic']);

        $this->save($this->draft(['clinic' => ['name' => 'Renamed'], 'settings' => ['holidays' => [['date' => '2026-12-25', 'name' => 'Christmas']]]]))->assertOk();

        $this->assertSame('Renamed', $this->clinic->fresh()->name);
        $this->assertSame('Beta Clinic', $other->fresh()->name);
        $this->assertSame(0, DB::table('clinic_holidays')->where('clinic_id', $other->id)->count());
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->admin)->get(route('admin.settings'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/settings'));
    }

    public function test_the_changed_values_the_clinic_sees_elsewhere_follow_the_save()
    {
        $this->save($this->draft(['clinic' => ['name' => 'Alpha Care']]))->assertOk();

        $this->actingAs($this->admin)->get('/admin')->assertInertia(fn ($page) => $page->where('auth.clinic.name', 'Alpha Care'));
    }
}
