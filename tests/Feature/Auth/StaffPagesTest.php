<?php

namespace Tests\Feature\Auth;

use App\Models\Clinic;
use App\Models\User;
use App\Support\DevInbox;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StaffPagesTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_pages_are_the_open_demo_while_real_sign_in_is_off()
    {
        config(['vocamed.real_auth' => false]);

        $this->get('/admin')->assertOk();
        $this->get('/reception')->assertOk();
        $this->get('/account')->assertOk();
    }

    public function test_staff_pages_need_a_signed_in_person_while_real_sign_in_is_on()
    {
        config(['vocamed.real_auth' => true]);

        foreach (['/admin', '/admin/staff', '/reception', '/doctor', '/account'] as $path) {
            $this->get($path)->assertRedirect(route('login'));
        }
    }

    public function test_a_signed_in_person_gets_the_pages_with_their_clinic_name()
    {
        config(['vocamed.real_auth' => true]);
        $clinic = Clinic::factory()->create(['name' => 'Noor Clinic']);
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();

        $this->actingAs($admin)->get('/admin')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('admin/overview')
                ->where('auth.user.email', $admin->email)
                ->where('auth.clinic', ['name' => 'Noor Clinic']));
    }

    public function test_the_public_pages_stay_open_in_both_modes()
    {
        config(['vocamed.real_auth' => true]);

        $this->get('/')->assertOk();
        $this->get(route('login'))->assertOk();
        $this->get(route('register'))->assertOk();
        $this->get(route('privacy'))->assertOk();
    }

    public function test_signing_out_returns_to_the_landing_page_and_closes_the_staff_pages()
    {
        config(['vocamed.real_auth' => true]);
        $admin = User::factory()->clinicAdmin()->create();

        $this->actingAs($admin)->post(route('logout'))->assertRedirect('/');
        $this->assertGuest();
        $this->get('/admin')->assertRedirect(route('login'));
    }

    public function test_sign_up_and_reset_emails_can_be_read_in_the_developer_inbox()
    {
        DevInbox::clear();

        $this->postJson(route('register.store'), [
            'clinic' => 'Noor Clinic',
            'country' => 'PK',
            'timezone' => 'Asia/Karachi',
            'name' => 'Dr Noor',
            'email' => 'noor@example.test',
            'password' => 'a-noor-password-1',
        ])->assertOk();

        $this->postJson(route('password.email'), ['email' => 'noor@example.test'])->assertOk();

        $this->get(route('dev.inbox'))
            ->assertOk()
            ->assertSee('noor@example.test')
            ->assertSee('Confirm your email address')
            ->assertSee('register/confirm', false)
            ->assertSee('reset-password', false);

        $this->post(route('dev.inbox.clear'))->assertRedirect(route('dev.inbox'));
        $this->assertSame([], DevInbox::all());
    }
}
