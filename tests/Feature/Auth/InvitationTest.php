<?php

namespace Tests\Feature\Auth;

use App\Enums\Role;
use App\Exceptions\DuplicateEmail;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationTest extends TestCase
{
    use RefreshDatabase;

    private function service(): InvitationService
    {
        return app(InvitationService::class);
    }

    public function test_the_token_is_shown_once_and_only_its_hash_is_stored(): void
    {
        $clinic = Clinic::factory()->create();

        [$invitation, $token] = $this->service()->issue($clinic, 'New.Person@Example.test', Role::Doctor);

        $this->assertSame(64, strlen($token));
        $this->assertSame(hash('sha256', $token), $invitation->token_hash);
        $this->assertDatabaseMissing('invitations', ['token_hash' => $token]);
        $this->assertSame('new.person@example.test', $invitation->email);
        $this->assertSame(Role::Doctor, $invitation->fresh()?->role);
        $this->assertTrue($invitation->expires_at->isSameDay(now()->addDays(7)));
    }

    public function test_inviting_the_same_address_again_replaces_the_waiting_invitation(): void
    {
        $clinic = Clinic::factory()->create();

        [, $first] = $this->service()->issue($clinic, 'new@example.test', Role::Receptionist);
        [, $second] = $this->service()->issue($clinic, 'new@example.test', Role::Receptionist);

        $this->assertSame(1, $this->withoutTenant(fn () => Invitation::query()->count()));
        $this->getJson(route('invitations.show', $first))->assertJsonPath('state', 'expired');
        $this->getJson(route('invitations.show', $second))->assertJsonPath('state', 'valid');
    }

    public function test_an_address_that_already_has_an_account_can_not_be_invited(): void
    {
        $user = User::factory()->create();

        $this->expectException(DuplicateEmail::class);

        $this->service()->issue(Clinic::factory()->create(), strtoupper($user->email), Role::Receptionist);
    }

    public function test_the_page_asks_what_a_link_is_and_gets_the_role_and_clinic_for_a_live_one(): void
    {
        $clinic = Clinic::factory()->create(['name' => 'Shifa Family Clinic']);
        [, $token] = $this->service()->issue($clinic, 'new@example.test', Role::Doctor);

        $this->getJson(route('invitations.show', $token))
            ->assertOk()
            ->assertExactJson(['state' => 'valid', 'role' => 'doctor', 'clinicName' => 'Shifa Family Clinic']);
    }

    public function test_used_expired_and_unknown_links_each_say_so_and_unknown_looks_expired(): void
    {
        Invitation::factory()->withToken('used-token')->accepted()->create();
        Invitation::factory()->withToken('old-token')->expired()->create();

        $this->getJson(route('invitations.show', 'used-token'))->assertExactJson(['state' => 'used']);
        $this->getJson(route('invitations.show', 'old-token'))->assertExactJson(['state' => 'expired']);
        $this->getJson(route('invitations.show', 'never-issued'))->assertExactJson(['state' => 'expired']);
    }

    public function test_a_link_stops_working_after_seven_days(): void
    {
        [, $token] = $this->service()->issue(Clinic::factory()->create(), 'new@example.test', Role::Receptionist);

        $this->travel(6)->days();
        $this->getJson(route('invitations.show', $token))->assertJsonPath('state', 'valid');

        $this->travel(2)->days();
        $this->getJson(route('invitations.show', $token))->assertJsonPath('state', 'expired');
    }

    public function test_accepting_creates_a_confirmed_account_with_the_invited_role_in_the_invited_clinic(): void
    {
        $clinic = Clinic::factory()->create(['default_locale' => 'ur']);
        [$invitation, $token] = $this->service()->issue($clinic, 'new@example.test', Role::Doctor);

        $this->postJson(route('invitations.accept', $token), ['name' => 'Dr. Sana', 'password' => 'a-good-password-1'])
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $user = User::query()->where('email', 'new@example.test')->firstOrFail();
        $this->assertSame($clinic->id, $user->clinic_id);
        $this->assertSame(Role::Doctor, $user->role);
        $this->assertSame('Dr. Sana', $user->name);
        $this->assertSame('ur', $user->locale);
        $this->assertTrue($user->is_active);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNotNull($invitation->fresh()?->accepted_at);
    }

    public function test_the_new_person_can_sign_in_but_is_not_signed_in_by_accepting(): void
    {
        [, $token] = $this->service()->issue(Clinic::factory()->create(), 'new@example.test', Role::Receptionist);

        $this->postJson(route('invitations.accept', $token), ['name' => 'Sana', 'password' => 'a-good-password-1'])->assertOk();
        $this->assertGuest();

        $this->postJson(route('login.store'), ['email' => 'new@example.test', 'password' => 'a-good-password-1'])
            ->assertOk()
            ->assertJsonPath('role', 'receptionist');
    }

    public function test_the_role_and_clinic_come_from_the_invitation_never_from_the_request(): void
    {
        $clinic = Clinic::factory()->create();
        $other = Clinic::factory()->create();
        [, $token] = $this->service()->issue($clinic, 'new@example.test', Role::Receptionist);

        $this->postJson(route('invitations.accept', $token), [
            'name' => 'Sana', 'password' => 'a-good-password-1', 'role' => 'clinic_admin', 'clinic_id' => $other->id, 'email' => 'other@example.test',
        ])->assertOk();

        $user = User::query()->where('email', 'new@example.test')->firstOrFail();
        $this->assertSame(Role::Receptionist, $user->role);
        $this->assertSame($clinic->id, $user->clinic_id);
        $this->assertDatabaseMissing('users', ['email' => 'other@example.test']);
    }

    public function test_a_link_can_be_used_only_once(): void
    {
        [, $token] = $this->service()->issue(Clinic::factory()->create(), 'new@example.test', Role::Receptionist);
        $input = ['name' => 'Sana', 'password' => 'a-good-password-1'];

        $this->postJson(route('invitations.accept', $token), $input)->assertOk();
        $this->postJson(route('invitations.accept', $token), $input)
            ->assertStatus(410)
            ->assertJsonPath('code', 'INVITATION_USED');

        $this->assertSame(1, User::query()->where('email', 'new@example.test')->count());
    }

    public function test_an_expired_or_unknown_link_can_not_be_accepted(): void
    {
        Invitation::factory()->withToken('old-token')->expired()->create();
        $input = ['name' => 'Sana', 'password' => 'a-good-password-1'];

        $this->postJson(route('invitations.accept', 'old-token'), $input)
            ->assertStatus(410)->assertJsonPath('code', 'INVITATION_EXPIRED');
        $this->postJson(route('invitations.accept', 'never-issued'), $input)
            ->assertStatus(410)->assertJsonPath('code', 'INVITATION_EXPIRED');

        $this->assertSame(0, User::query()->count());
    }

    public function test_a_weak_password_or_missing_name_is_refused_and_the_link_stays_usable(): void
    {
        [, $token] = $this->service()->issue(Clinic::factory()->create(), 'new@example.test', Role::Receptionist);

        $this->postJson(route('invitations.accept', $token), ['name' => 'Sana', 'password' => 'short1'])
            ->assertStatus(422)->assertJsonPath('field', 'password');
        $this->postJson(route('invitations.accept', $token), ['name' => '', 'password' => 'a-good-password-1'])
            ->assertStatus(422)->assertJsonPath('field', 'name');

        $this->getJson(route('invitations.show', $token))->assertJsonPath('state', 'valid');
    }

    public function test_if_the_address_got_an_account_in_the_meantime_the_link_reads_as_used(): void
    {
        [, $token] = $this->service()->issue(Clinic::factory()->create(), 'new@example.test', Role::Receptionist);
        User::factory()->create(['email' => 'new@example.test']);

        $this->postJson(route('invitations.accept', $token), ['name' => 'Sana', 'password' => 'a-good-password-1'])
            ->assertStatus(410)->assertJsonPath('code', 'INVITATION_USED');
    }

    public function test_the_invite_page_renders_with_its_token(): void
    {
        $this->get(route('invite', 'some-token'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('auth/invite')->where('token', 'some-token'));
    }

    public function test_the_command_prints_a_working_link_once(): void
    {
        $clinic = Clinic::factory()->create();

        $this->artisan('clinic:invite', ['--clinic' => $clinic->id, '--email' => 'new@example.test', '--role' => 'doctor'])
            ->expectsOutputToContain('/invite/')
            ->assertSuccessful();

        $this->assertSame(1, $this->withoutTenant(fn () => Invitation::query()->where('email', 'new@example.test')->count()));
    }

    public function test_the_command_refuses_an_unknown_clinic_a_bad_role_and_a_used_address(): void
    {
        $clinic = Clinic::factory()->create();
        $user = User::factory()->create();

        $this->artisan('clinic:invite', ['--clinic' => 'nope', '--email' => 'a@example.test', '--role' => 'doctor'])->assertFailed();
        $this->artisan('clinic:invite', ['--clinic' => $clinic->id, '--email' => 'a@example.test', '--role' => 'wizard'])->assertFailed();
        $this->artisan('clinic:invite', ['--clinic' => $clinic->id, '--email' => $user->email, '--role' => 'doctor'])->assertFailed();

        $this->assertSame(0, $this->withoutTenant(fn () => Invitation::query()->count()));
    }
}
