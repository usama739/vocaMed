<?php

namespace Tests\Feature\Admin;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class TemplatesTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create(['name' => 'Alpha Clinic']);
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
    }

    private function key(array $overrides = []): array
    {
        return array_merge(['kind' => 'reminder', 'channel' => 'sms', 'locale' => 'en'], $overrides);
    }

    private function templates(?User $as = null): array
    {
        return $this->actingAs($as ?? $this->admin)->getJson(route('admin.templates'))->assertOk()->json('templates');
    }

    private function find(array $templates, array $key): array
    {
        return collect($templates)->first(fn ($t) => $t['kind'] === $key['kind'] && $t['channel'] === $key['channel'] && $t['locale'] === $key['locale']);
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $this->assertSameShape($this->fixture('admin-templates-view'), $this->actingAs($this->admin)->getJson(route('admin.templates'))->json());
    }

    public function test_there_are_sixteen_messages_all_on_their_defaults_to_start_with()
    {
        $all = $this->templates();

        $this->assertCount(16, $all);
        $this->assertSame([], array_filter($all, fn ($t) => $t['isCustom'] || $t['body'] !== $t['defaultBody']));
        $this->assertSame(['patient_name', 'doctor', 'time', 'clinic_name', 'link'], $this->actingAs($this->admin)->getJson(route('admin.templates'))->json('variables'));
    }

    public function test_saving_stores_the_clinics_own_wording_for_that_message_only()
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => '  Hello {patient_name}, see {doctor} at {time}.  '])->assertOk()->assertExactJson(['ok' => true]);

        $all = $this->templates();
        $own = $this->find($all, $this->key());

        $this->assertTrue($own['isCustom']);
        $this->assertSame('Hello {patient_name}, see {doctor} at {time}.', $own['body']);
        $this->assertNotSame($own['body'], $own['defaultBody']);
        $this->assertFalse($this->find($all, $this->key(['channel' => 'whatsapp']))['isCustom']);
        $this->assertFalse($this->find($all, $this->key(['locale' => 'ur']))['isCustom']);
        $this->assertSame(['template.updated'], $this->actions());
        $this->assertSame(['kind' => 'reminder', 'channel' => 'sms', 'locale' => 'en'], json_decode(DB::table('audit_logs')->value('meta'), true));
    }

    public function test_saving_the_built_in_wording_again_makes_it_a_default_again()
    {
        $default = $this->find($this->templates(), $this->key())['defaultBody'];
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'Custom {doctor}'])->assertOk();
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => $default])->assertOk();

        $this->assertFalse($this->find($this->templates(), $this->key())['isCustom']);
        $this->assertSame(0, DB::table('notification_templates')->count());
    }

    public function test_editing_again_replaces_rather_than_adds()
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'One {doctor}'])->assertOk();
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'Two {doctor}'])->assertOk();

        $this->assertSame(1, DB::table('notification_templates')->count());
        $this->assertSame('Two {doctor}', $this->find($this->templates(), $this->key())['body']);
    }

    public function test_reset_goes_back_to_the_built_in_wording_and_is_audited_only_when_something_changed()
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'Custom {doctor}'])->assertOk();
        DB::table('audit_logs')->delete();

        $this->actingAs($this->admin)->deleteJson(route('admin.templates.destroy'), $this->key())->assertOk();
        $this->actingAs($this->admin)->deleteJson(route('admin.templates.destroy'), $this->key())->assertOk();

        $this->assertFalse($this->find($this->templates(), $this->key())['isCustom']);
        $this->assertSame(['template.reset'], $this->actions());
    }

    public function test_an_unknown_placeholder_is_refused_and_named()
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'Hi {patient_name}, your {room} is ready'])
            ->assertStatus(422)->assertJsonPath('code', 'UNKNOWN_VARIABLE')->assertJsonPath('field', 'body')->assertJsonPath('detail', 'room');

        $this->assertSame(0, DB::table('notification_templates')->count());
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badBodies(): array
    {
        return [
            'an empty message' => [['body' => '   '], 'body'],
            'a message that is too long' => [['body' => str_repeat('a', 1001)], 'body'],
            'a kind that does not exist' => [['kind' => 'welcome', 'body' => 'x'], 'kind'],
            'a channel that does not exist' => [['channel' => 'fax', 'body' => 'x'], 'channel'],
            'a language that does not exist' => [['locale' => 'fr', 'body' => 'x'], 'locale'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badBodies')]
    public function test_bad_input_is_refused_on_its_field(array $overrides, string $field)
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), ...$overrides])
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', $field);

        $this->assertSame(0, DB::table('notification_templates')->count());
    }

    public function test_one_clinics_wording_never_shows_in_another()
    {
        $this->actingAs($this->admin)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'Alpha only {doctor}'])->assertOk();
        $otherAdmin = User::factory()->clinicAdmin()->forClinic(Clinic::factory()->create())->create();

        $this->assertFalse($this->find($this->templates($otherAdmin), $this->key())['isCustom']);
        $this->actingAs($otherAdmin)->deleteJson(route('admin.templates.destroy'), $this->key())->assertOk();
        $this->assertTrue($this->find($this->templates(), $this->key())['isCustom'], 'Resetting in another clinic must not touch this one.');
    }

    public function test_a_test_message_is_checked_and_written_to_the_log_with_sample_details()
    {
        Log::spy();

        $this->actingAs($this->admin)->postJson(route('admin.templates.test'), [...$this->key(), 'body' => 'Hi {patient_name}, {doctor} at {time}', 'phone' => '0300 1234567'])
            ->assertOk()->assertExactJson(['sentTo' => '+923001234567']);

        Log::shouldHaveReceived('info')->withArgs(fn ($message, $context) => $context['to'] === '+923001234567' && $context['text'] === 'Hi Ayesha Khan, Dr. Rahman at Tomorrow, 4:00 PM')->once();
    }

    public function test_a_test_message_needs_a_real_number_and_a_valid_text()
    {
        $this->actingAs($this->admin)->postJson(route('admin.templates.test'), [...$this->key(), 'body' => 'Hi {doctor}', 'phone' => '12'])
            ->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE')->assertJsonPath('field', 'phone');
        $this->actingAs($this->admin)->postJson(route('admin.templates.test'), [...$this->key(), 'body' => 'Hi {nobody}', 'phone' => '0300 1234567'])
            ->assertStatus(422)->assertJsonPath('code', 'UNKNOWN_VARIABLE');
    }

    public function test_only_the_clinic_admin_may_read_or_change_templates()
    {
        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('admin.templates'))->assertForbidden();
            $this->actingAs($user)->putJson(route('admin.templates.update'), [...$this->key(), 'body' => 'x {doctor}'])->assertForbidden();
            $this->actingAs($user)->deleteJson(route('admin.templates.destroy'), $this->key())->assertForbidden();
            $this->actingAs($user)->postJson(route('admin.templates.test'), [...$this->key(), 'body' => 'x', 'phone' => '0300 1234567'])->assertForbidden();
        }

        $this->assertSame(0, DB::table('notification_templates')->count());
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->admin)->get(route('admin.templates'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/templates'));
    }
}
