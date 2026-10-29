<?php

namespace Tests\Feature\Account;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true, 'session.driver' => 'database']);
        $this->user = User::factory()->doctor()->forClinic(Clinic::factory()->create())->create([
            'name' => 'Dr Sana',
            'email' => 'sana@example.test',
            'password' => 'current-password-1',
        ]);
    }

    /** Another device of the same person: a row in the sessions table. */
    private function openOtherSession(User $user, string $id): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $user->id,
            'ip_address' => '10.0.0.9',
            'user_agent' => 'Other device',
            'payload' => '',
            'last_activity' => time(),
        ]);
    }

    /** How many of the other devices opened with openOtherSession() are still signed in. */
    private function sessionsOf(User $user): int
    {
        return DB::table('sessions')->where('user_id', $user->id)->where('user_agent', 'Other device')->count();
    }

    public function test_the_page_answers_json_with_what_it_shows()
    {
        $this->openOtherSession($this->user, 'other-1');
        $this->openOtherSession($this->user, 'other-2');

        $this->actingAs($this->user)->getJson(route('account'))
            ->assertOk()
            ->assertExactJson([
                'user' => ['id' => (string) $this->user->id, 'name' => 'Dr Sana', 'email' => 'sana@example.test', 'role' => 'doctor', 'locale' => 'en'],
                'notifications' => ['failedReminders' => true, 'patientCancellations' => true, 'dailySummary' => false],
                'otherSessions' => 2,
            ]);
    }

    public function test_the_same_address_renders_the_page_for_a_browser()
    {
        $this->actingAs($this->user)->get(route('account'))->assertOk()->assertInertia(fn ($page) => $page->component('account'));
    }

    public function test_every_role_can_use_the_account_page()
    {
        foreach ([Role::ClinicAdmin, Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic(Clinic::factory()->create())->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('account'))->assertOk()->assertJsonPath('user.role', $role->value);
        }
    }

    public function test_nobody_signed_in_cannot_use_any_account_route()
    {
        $this->getJson(route('account'))->assertUnauthorized();
        $this->patchJson(route('account.update'), ['name' => 'X', 'locale' => 'en'])->assertUnauthorized();
        $this->putJson(route('account.password'), [])->assertUnauthorized();
        $this->patchJson(route('account.notifications'), [])->assertUnauthorized();
        $this->postJson(route('account.sessions.logout-others'), [])->assertUnauthorized();
    }

    // Profile

    public function test_the_name_and_language_are_saved_and_returned()
    {
        $this->actingAs($this->user)
            ->patchJson(route('account.update'), ['name' => '  Dr Sana Malik  ', 'locale' => 'ur'])
            ->assertOk()
            ->assertJson(['name' => 'Dr Sana Malik', 'locale' => 'ur', 'email' => 'sana@example.test']);

        $this->assertSame('Dr Sana Malik', $this->user->fresh()->name);
        $this->assertSame('ur', $this->user->fresh()->locale);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badProfiles(): array
    {
        return [
            'empty name' => [['name' => '', 'locale' => 'en'], 'name'],
            'blank name' => [['name' => '   ', 'locale' => 'en'], 'name'],
            'long name' => [['name' => str_repeat('a', 121), 'locale' => 'en'], 'name'],
            'unknown language' => [['name' => 'Dr Sana', 'locale' => 'fr'], 'locale'],
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     */
    #[DataProvider('badProfiles')]
    public function test_a_bad_profile_is_refused_on_its_field(array $input, string $field)
    {
        $this->actingAs($this->user)->patchJson(route('account.update'), $input)
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', $field);

        $this->assertSame('Dr Sana', $this->user->fresh()->name);
    }

    public function test_the_email_cannot_be_changed_here()
    {
        $this->actingAs($this->user)->patchJson(route('account.update'), ['name' => 'Dr Sana', 'locale' => 'en', 'email' => 'other@example.test', 'role' => 'clinic_admin', 'clinic_id' => 'x'])->assertOk();

        $fresh = $this->user->fresh();
        $this->assertSame('sana@example.test', $fresh->email);
        $this->assertSame(Role::Doctor, $fresh->role);
    }

    // Password

    public function test_the_password_changes_and_this_session_keeps_working()
    {
        $this->actingAs($this->user)
            ->putJson(route('account.password'), ['current' => 'current-password-1', 'password' => 'a-brand-new-pass-9', 'confirm' => 'a-brand-new-pass-9'])
            ->assertOk()->assertExactJson(['ok' => true]);

        $this->assertTrue(Hash::check('a-brand-new-pass-9', $this->user->fresh()->password));
        $this->getJson(route('account'))->assertOk();
    }

    public function test_changing_the_password_signs_the_other_sessions_out_and_rotates_remember_me()
    {
        $this->openOtherSession($this->user, 'other-1');
        $this->openOtherSession($this->user, 'other-2');
        $before = $this->user->remember_token;

        $this->actingAs($this->user)
            ->putJson(route('account.password'), ['current' => 'current-password-1', 'password' => 'a-brand-new-pass-9', 'confirm' => 'a-brand-new-pass-9'])
            ->assertOk();

        $this->assertSame(0, $this->sessionsOf($this->user));
        $this->assertNotSame($before, $this->user->fresh()->remember_token);
    }

    public function test_a_wrong_current_password_changes_nothing()
    {
        $this->openOtherSession($this->user, 'other-1');

        $this->actingAs($this->user)
            ->putJson(route('account.password'), ['current' => 'not-my-password-1', 'password' => 'a-brand-new-pass-9', 'confirm' => 'a-brand-new-pass-9'])
            ->assertStatus(422)->assertJsonPath('code', 'INVALID_PASSWORD')->assertJsonPath('field', 'current');

        $this->assertTrue(Hash::check('current-password-1', $this->user->fresh()->password));
        $this->assertSame(1, $this->sessionsOf($this->user));
    }

    public function test_a_weak_or_mismatched_new_password_is_refused_on_its_field()
    {
        $this->actingAs($this->user)
            ->putJson(route('account.password'), ['current' => 'current-password-1', 'password' => 'short1', 'confirm' => 'short1'])
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', 'password');

        $this->actingAs($this->user)
            ->putJson(route('account.password'), ['current' => 'current-password-1', 'password' => 'a-brand-new-pass-9', 'confirm' => 'a-different-pass-9'])
            ->assertStatus(422)->assertJsonPath('field', 'confirm');

        $this->assertTrue(Hash::check('current-password-1', $this->user->fresh()->password));
    }

    public function test_guessing_the_current_password_is_limited_to_six_tries_a_minute()
    {
        RateLimiter::clear('account:'.$this->user->id);
        $input = ['current' => 'wrong-guess-1', 'password' => 'a-brand-new-pass-9', 'confirm' => 'a-brand-new-pass-9'];

        for ($i = 0; $i < 6; $i++) {
            $this->actingAs($this->user)->putJson(route('account.password'), $input)->assertStatus(422);
        }

        $this->actingAs($this->user)->putJson(route('account.password'), [...$input, 'current' => 'current-password-1'])
            ->assertStatus(429)->assertJsonPath('code', 'RATE_LIMITED');
        $this->actingAs($this->user)->postJson(route('account.sessions.logout-others'), ['password' => 'current-password-1'])
            ->assertStatus(429);
    }

    // Email choices

    public function test_a_choice_is_kept_and_shown_next_time()
    {
        $this->actingAs($this->user)->patchJson(route('account.notifications'), ['key' => 'dailySummary', 'on' => true])->assertOk();
        $this->actingAs($this->user)->patchJson(route('account.notifications'), ['key' => 'failedReminders', 'on' => false])->assertOk();

        $this->actingAs($this->user)->getJson(route('account'))->assertJsonPath(
            'notifications',
            ['failedReminders' => false, 'patientCancellations' => true, 'dailySummary' => true],
        );
    }

    public function test_an_unknown_choice_is_refused()
    {
        $this->actingAs($this->user)->patchJson(route('account.notifications'), ['key' => 'spam', 'on' => true])
            ->assertStatus(422)->assertJsonPath('field', 'key');
        $this->actingAs($this->user)->patchJson(route('account.notifications'), ['key' => 'dailySummary'])
            ->assertStatus(422)->assertJsonPath('field', 'on');
    }

    // Other sessions

    public function test_signing_out_the_others_ends_them_and_reports_how_many()
    {
        $this->openOtherSession($this->user, 'other-1');
        $this->openOtherSession($this->user, 'other-2');
        $this->openOtherSession($this->user, 'other-3');

        $this->actingAs($this->user)
            ->postJson(route('account.sessions.logout-others'), ['password' => 'current-password-1'])
            ->assertOk()->assertExactJson(['ended' => 3]);

        $this->assertSame(0, $this->sessionsOf($this->user));
    }

    public function test_signing_out_the_others_needs_the_right_password()
    {
        $this->openOtherSession($this->user, 'other-1');

        $this->actingAs($this->user)
            ->postJson(route('account.sessions.logout-others'), ['password' => 'wrong-password-1'])
            ->assertStatus(422)->assertJsonPath('code', 'INVALID_PASSWORD');

        $this->assertSame(1, $this->sessionsOf($this->user));
    }

    public function test_only_my_own_sessions_are_counted_and_ended()
    {
        $colleague = User::factory()->receptionist()->forClinic($this->user->clinic)->create();
        $this->openOtherSession($colleague, 'colleague-1');
        $this->openOtherSession($this->user, 'mine-1');

        $this->actingAs($this->user)
            ->postJson(route('account.sessions.logout-others'), ['password' => 'current-password-1'])
            ->assertExactJson(['ended' => 1]);

        $this->assertSame(1, DB::table('sessions')->where('user_id', $colleague->id)->count());
    }

    public function test_the_account_of_someone_else_cannot_be_reached_through_the_request()
    {
        $other = User::factory()->doctor()->forClinic($this->user->clinic)->create(['name' => 'Dr Other']);

        $this->actingAs($this->user)
            ->patchJson(route('account.update'), ['name' => 'Renamed', 'locale' => 'en', 'id' => $other->id, 'user_id' => $other->id])
            ->assertOk()->assertJsonPath('id', (string) $this->user->id);

        $this->assertSame('Dr Other', $other->fresh()->name);
    }
}
