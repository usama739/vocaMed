<?php

namespace Tests\Feature\Auth;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered()
    {
        $this->get(route('login'))->assertOk();
    }

    /**
     * @return array<string, array{0: Role, 1: string}>
     */
    public static function roleHomes(): array
    {
        return [
            'clinic admin' => [Role::ClinicAdmin, '/admin'],
            'receptionist' => [Role::Receptionist, '/reception'],
            'doctor' => [Role::Doctor, '/doctor'],
        ];
    }

    #[DataProvider('roleHomes')]
    public function test_each_role_lands_in_its_own_area_after_signing_in(Role $role, string $home)
    {
        $user = User::factory()->create(['role' => $role]);

        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect($home);

        $this->assertAuthenticatedAs($user);
    }

    public function test_a_json_sign_in_answers_with_the_role_for_the_page_to_redirect_to()
    {
        $user = User::factory()->doctor()->create();

        $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertExactJson(['ok' => true, 'role' => 'doctor', 'home' => '/doctor']);
    }

    public function test_the_email_is_matched_without_regard_to_case_or_spaces()
    {
        $user = User::factory()->create(['email' => 'front.desk@example.test']);

        $this->postJson(route('login.store'), ['email' => '  Front.Desk@Example.TEST ', 'password' => 'password'])
            ->assertOk();

        $this->assertAuthenticatedAs($user);
    }

    public function test_a_wrong_password_and_an_unknown_address_look_exactly_alike()
    {
        $user = User::factory()->create();

        $wrongPassword = $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'wrong-password-1']);
        $unknownAddress = $this->postJson(route('login.store'), ['email' => 'nobody@example.test', 'password' => 'wrong-password-1']);

        $wrongPassword->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', 'email');
        $this->assertSame($wrongPassword->json(), $unknownAddress->json());
        $this->assertGuest();
    }

    /**
     * @return array<string, array{0: callable(): User}>
     */
    public static function peopleWhoCannotSignIn(): array
    {
        return [
            'deactivated' => [fn () => User::factory()->inactive()->create()],
            'clinic suspended' => [fn () => User::factory()->for(Clinic::factory()->suspended())->create()],
            'address not confirmed' => [fn () => User::factory()->unverified()->create()],
            'no role' => [fn () => User::factory()->create(['role' => null])],
            'no clinic' => [fn () => User::factory()->create(['clinic_id' => null])],
        ];
    }

    /**
     * @param  callable(): User  $makeUser
     */
    #[DataProvider('peopleWhoCannotSignIn')]
    public function test_the_right_password_is_not_enough_when_the_account_may_not_sign_in(callable $makeUser)
    {
        $user = $makeUser();

        $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'password'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION');

        $this->assertGuest();
    }

    public function test_remember_me_sets_a_long_lived_cookie()
    {
        $user = User::factory()->create();

        $response = $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password', 'remember' => true]);

        $names = array_map(fn ($cookie) => $cookie->getName(), $response->headers->getCookies());
        $this->assertNotEmpty(array_filter($names, fn (string $name) => str_starts_with($name, 'remember_web_')));
    }

    public function test_users_can_logout()
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post(route('logout'))->assertRedirect(route('home'));

        $this->assertGuest();
    }

    public function test_someone_already_signed_in_is_sent_to_their_own_area_from_the_sign_in_page()
    {
        $this->actingAs(User::factory()->doctor()->create())
            ->get(route('login'))
            ->assertRedirect('/doctor');
    }

    public function test_too_many_attempts_are_refused_with_a_wait_time_for_the_countdown()
    {
        $user = User::factory()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'wrong-password-1']);
        }

        $response = $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'password']);

        $response->assertStatus(429)->assertJsonPath('code', 'RATE_LIMITED')->assertHeader('Retry-After');
        $this->assertGreaterThan(0, $response->json('retryAfter'));
        $this->assertGuest();
    }

    public function test_the_failed_attempt_counter_also_locks_out_with_the_same_answer()
    {
        $user = User::factory()->create();
        // Fortify's own counter of failed attempts, keyed by address and network.
        RateLimiter::increment(md5('login'.implode('|', [$user->email, '127.0.0.1'])), amount: 5);

        $this->postJson(route('login.store'), ['email' => $user->email, 'password' => 'wrong-password-1'])
            ->assertStatus(429)
            ->assertJsonPath('code', 'RATE_LIMITED');
    }

    public function test_deactivating_someone_ends_their_session_on_the_next_request()
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $this->get(route('account'))->assertOk();

        $user->forceFill(['is_active' => false])->save();

        $this->get(route('account'))->assertRedirect(route('login'));
        $this->assertGuest();
    }

    public function test_suspending_a_clinic_ends_everyones_session_and_json_callers_are_told_so()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $user->clinic?->forceFill(['status' => 'suspended'])->save();

        $this->getJson(route('account'))->assertStatus(401)->assertJsonPath('code', 'UNAUTHENTICATED');
        $this->assertGuest();
    }

    public function test_pages_receive_only_a_slim_signed_in_user()
    {
        $user = User::factory()->clinicAdmin()->create(['name' => 'Dr. Ayesha Khan', 'locale' => 'ur']);

        $this->actingAs($user)->get(route('account'))->assertInertia(fn (Assert $page) => $page
            ->where('auth.user.id', (string) $user->id)
            ->where('auth.user.name', 'Dr. Ayesha Khan')
            ->where('auth.user.email', $user->email)
            ->where('auth.user.role', 'clinic_admin')
            ->where('auth.user.locale', 'ur')
            ->missing('auth.user.password')
            ->missing('auth.user.clinic_id')
            ->missing('auth.user.remember_token'));
    }

    public function test_guests_receive_no_user()
    {
        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('auth.user', null));
    }
}
