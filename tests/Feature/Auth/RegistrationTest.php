<?php

namespace Tests\Feature\Auth;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use App\Notifications\ConfirmClinicEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.self_service_signup' => true]);
    }

    /**
     * @return array<string, string>
     */
    private function form(array $overrides = []): array
    {
        return [
            'clinic' => 'Shifa Family Clinic',
            'country' => 'PK',
            'timezone' => 'Asia/Karachi',
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'a-good-password-1',
            ...$overrides,
        ];
    }

    public function test_registration_screen_can_be_rendered()
    {
        $this->get(route('register'))->assertOk()->assertInertia(fn ($page) => $page->component('auth/register'));
    }

    public function test_signing_up_opens_a_clinic_with_the_person_as_its_unconfirmed_admin_and_emails_them()
    {
        Notification::fake();

        $this->postJson(route('register.store'), $this->form())->assertOk()->assertExactJson(['ok' => true]);

        $user = User::query()->where('email', 'test@example.com')->firstOrFail();
        $this->assertSame(Role::ClinicAdmin, $user->role);
        $this->assertSame('Shifa Family Clinic', $user->clinic?->name);
        $this->assertSame('Asia/Karachi', $user->clinic?->timezone);
        $this->assertNull($user->email_verified_at);
        $this->assertGuest();
        Notification::assertSentTo($user, ConfirmClinicEmail::class);
    }

    public function test_the_clinic_uses_the_language_the_person_was_reading_in()
    {
        Notification::fake();

        // `post` with an Accept header, because `postJson` does not carry test cookies.
        $this->withUnencryptedCookie('locale', 'ur')
            ->post(route('register.store'), $this->form(), ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertSame('ur', Clinic::query()->firstOrFail()->default_locale);
    }

    public function test_the_workspace_stays_closed_until_the_address_is_confirmed()
    {
        Notification::fake();
        $this->postJson(route('register.store'), $this->form())->assertOk();

        $this->postJson(route('login.store'), ['email' => 'test@example.com', 'password' => 'a-good-password-1'])
            ->assertStatus(422);

        $this->assertGuest();
    }

    public function test_following_the_emailed_link_confirms_the_address_and_signs_the_admin_in()
    {
        Notification::fake();
        $this->postJson(route('register.store'), $this->form())->assertOk();
        $user = User::query()->where('email', 'test@example.com')->firstOrFail();

        $url = (new ConfirmClinicEmail)->url($user);

        $this->get($url)->assertRedirect('/admin');
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()?->email_verified_at);
    }

    public function test_a_tampered_expired_or_mismatched_link_does_not_confirm_anything()
    {
        Notification::fake();
        $this->postJson(route('register.store'), $this->form())->assertOk();
        $user = User::query()->where('email', 'test@example.com')->firstOrFail();
        $url = (new ConfirmClinicEmail)->url($user);

        $this->get($url.'x')->assertForbidden();
        $this->get(URL::temporarySignedRoute('register.confirm', now()->addHour(), ['user' => $user->id, 'hash' => sha1('other@example.com')]))
            ->assertForbidden();

        $this->travel(25)->hours();
        $this->get($url)->assertForbidden();

        $this->assertNull($user->fresh()?->email_verified_at);
        $this->assertGuest();
    }

    public function test_an_address_that_is_taken_is_refused_whatever_its_case_and_creates_no_second_clinic()
    {
        Notification::fake();
        User::factory()->create(['email' => 'test@example.com']);
        $clinics = Clinic::query()->count();

        $this->postJson(route('register.store'), $this->form(['email' => ' Test@Example.com ']))
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION')
            ->assertJsonPath('field', 'email');

        $this->assertSame($clinics, Clinic::query()->count());
        Notification::assertNothingSent();
    }

    public function test_sign_up_without_a_clinic_or_with_a_weak_password_is_refused()
    {
        $this->postJson(route('register.store'), $this->form(['clinic' => '', 'timezone' => 'Mars/Olympus', 'password' => 'short1']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['clinic', 'timezone', 'password']);

        $this->assertSame(0, User::query()->count());
    }

    public function test_role_and_clinic_can_not_be_chosen_on_sign_up()
    {
        Notification::fake();
        $other = Clinic::factory()->create();

        $this->postJson(route('register.store'), $this->form(['role' => 'doctor', 'clinic_id' => $other->id]))->assertOk();

        $user = User::query()->where('email', 'test@example.com')->firstOrFail();
        $this->assertSame(Role::ClinicAdmin, $user->role);
        $this->assertNotSame($other->id, $user->clinic_id);
    }

    public function test_when_self_service_is_off_the_page_sends_people_to_the_landing_page_and_nothing_is_created()
    {
        config(['vocamed.self_service_signup' => false]);

        $this->get(route('register'))->assertRedirect('/');
        $this->postJson(route('register.store'), $this->form())->assertNotFound();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(0, Clinic::query()->count());
    }

    public function test_someone_already_signed_in_is_sent_to_their_area_from_the_sign_up_page()
    {
        $this->actingAs(User::factory()->receptionist()->create())
            ->get(route('register'))
            ->assertRedirect('/reception');
    }

    public function test_the_confirmation_email_carries_the_signed_link()
    {
        $user = User::factory()->unverified()->create();

        $mail = (new ConfirmClinicEmail)->toMail($user);

        $this->assertSame((new ConfirmClinicEmail)->url($user) !== '', true);
        $this->assertStringContainsString('register/confirm/'.$user->id, $mail->actionUrl);
        $this->assertStringContainsString('signature=', $mail->actionUrl);
    }
}
