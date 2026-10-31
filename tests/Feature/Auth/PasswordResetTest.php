<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\QueuedResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Fortify\Features;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->skipUnlessFortifyHas(Features::resetPasswords());
    }

    /** Ask for a link and hand back the token the email would carry. */
    private function tokenFor(User $user): string
    {
        Notification::fake();

        $this->postJson(route('password.email'), ['email' => $user->email])->assertOk();

        $token = null;
        Notification::assertSentTo($user, QueuedResetPassword::class, function (QueuedResetPassword $notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        return (string) $token;
    }

    public function test_reset_password_link_screen_can_be_rendered()
    {
        $this->get(route('password.request'))->assertOk();
    }

    public function test_reset_password_screen_can_be_rendered_and_knows_the_address()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->get(route('password.reset', ['token' => $token, 'email' => $user->email]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('token', $token)->where('email', $user->email));
    }

    public function test_a_link_is_sent_to_a_known_address()
    {
        Notification::fake();
        $user = User::factory()->create();

        $this->postJson(route('password.email'), ['email' => $user->email])->assertOk()->assertExactJson(['ok' => true]);

        Notification::assertSentTo($user, QueuedResetPassword::class);
    }

    public function test_asking_for_a_link_never_reveals_whether_the_address_has_an_account()
    {
        Notification::fake();
        $user = User::factory()->create();

        $known = $this->postJson(route('password.email'), ['email' => $user->email]);
        $unknown = $this->postJson(route('password.email'), ['email' => 'nobody@example.test']);

        $this->assertSame($known->status(), $unknown->status());
        $this->assertSame($known->json(), $unknown->json());
        Notification::assertSentToTimes($user, QueuedResetPassword::class, 1);
        Notification::assertCount(1);
    }

    public function test_asking_again_straight_away_looks_the_same_even_though_no_second_link_is_sent()
    {
        Notification::fake();
        $user = User::factory()->create();

        $this->postJson(route('password.email'), ['email' => $user->email])->assertOk();
        $this->postJson(route('password.email'), ['email' => $user->email])->assertOk()->assertExactJson(['ok' => true]);

        Notification::assertSentToTimes($user, QueuedResetPassword::class, 1);
    }

    public function test_the_page_can_check_a_link_before_showing_the_form()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->getJson(route('password.status', ['token' => $token, 'email' => $user->email]))
            ->assertOk()->assertExactJson(['state' => 'valid']);
    }

    public function test_wrong_unknown_and_expired_links_all_read_as_expired()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->getJson(route('password.status', ['token' => 'not-the-token', 'email' => $user->email]))
            ->assertExactJson(['state' => 'expired']);
        $this->getJson(route('password.status', ['token' => $token, 'email' => 'nobody@example.test']))
            ->assertExactJson(['state' => 'expired']);

        $this->travel(61)->minutes();

        $this->getJson(route('password.status', ['token' => $token, 'email' => $user->email]))
            ->assertExactJson(['state' => 'expired']);
    }

    public function test_password_can_be_reset_with_valid_token()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->postJson(route('password.update'), [
            'token' => $token,
            'email' => $user->email,
            'password' => 'a-brand-new-password-1',
            'password_confirmation' => 'a-brand-new-password-1',
        ])->assertOk();

        $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'a-brand-new-password-1'])->assertOk();
    }

    public function test_a_link_works_only_once()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);
        $input = [
            'token' => $token,
            'email' => $user->email,
            'password' => 'a-brand-new-password-1',
            'password_confirmation' => 'a-brand-new-password-1',
        ];

        $this->postJson(route('password.update'), $input)->assertOk();
        $this->postJson(route('password.update'), $input)->assertStatus(422);
    }

    public function test_password_cannot_be_reset_with_invalid_token(): void
    {
        $user = User::factory()->create();

        $this->postJson(route('password.update'), [
            'token' => 'invalid-token',
            'email' => $user->email,
            'password' => 'a-brand-new-password-1',
            'password_confirmation' => 'a-brand-new-password-1',
        ])->assertStatus(422);
    }

    public function test_a_weak_or_unconfirmed_new_password_is_refused_and_the_old_one_still_works()
    {
        $user = User::factory()->create();
        $token = $this->tokenFor($user);

        $this->postJson(route('password.update'), [
            'token' => $token, 'email' => $user->email, 'password' => 'short1', 'password_confirmation' => 'short1',
        ])->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', 'password');

        $this->postJson(route('password.update'), [
            'token' => $token, 'email' => $user->email, 'password' => 'a-brand-new-password-1', 'password_confirmation' => 'different-password-1',
        ])->assertStatus(422)->assertJsonPath('field', 'password');

        $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'password'])->assertOk();
    }

    public function test_resetting_proves_the_address_and_confirms_it()
    {
        $user = User::factory()->unverified()->create();
        $token = $this->tokenFor($user);

        $this->postJson(route('password.update'), [
            'token' => $token, 'email' => $user->email, 'password' => 'a-brand-new-password-1', 'password_confirmation' => 'a-brand-new-password-1',
        ])->assertOk();

        $this->assertNotNull($user->fresh()?->email_verified_at);
    }

    public function test_resetting_ends_every_open_session_and_remember_me_cookie()
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create(['remember_token' => 'old-remember-token']);
        $other = User::factory()->create();
        foreach ([$user, $user, $other] as $i => $person) {
            DB::table('sessions')->insert([
                'id' => "session-{$i}", 'user_id' => $person->id, 'payload' => '', 'last_activity' => time(),
            ]);
        }
        $token = $this->tokenFor($user);

        $this->postJson(route('password.update'), [
            'token' => $token, 'email' => $user->email, 'password' => 'a-brand-new-password-1', 'password_confirmation' => 'a-brand-new-password-1',
        ])->assertOk();

        $this->assertSame(0, DB::table('sessions')->where('user_id', $user->id)->count());
        $this->assertSame(1, DB::table('sessions')->where('user_id', $other->id)->count());
        $this->assertNotSame('old-remember-token', $user->fresh()?->remember_token);
    }
}
