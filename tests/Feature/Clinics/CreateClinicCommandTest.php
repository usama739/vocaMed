<?php

namespace Tests\Feature\Clinics;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CreateClinicCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_a_clinic_and_its_first_admin(): void
    {
        $this->artisan('clinic:create', [
            '--name' => 'Shifa Family Clinic',
            '--admin-name' => 'Dr. Ayesha Khan',
            '--admin-email' => 'admin@shifa.test',
        ])
            ->expectsQuestion('Admin password', 'a-long-password-1')
            ->assertSuccessful();

        $admin = User::query()->where('email', 'admin@shifa.test')->firstOrFail();
        $this->assertSame(Role::ClinicAdmin, $admin->role);
        $this->assertSame('Shifa Family Clinic', $admin->clinic?->name);
        $this->assertSame('Asia/Karachi', $admin->clinic?->timezone);
    }

    public function test_it_creates_nothing_when_the_input_is_invalid(): void
    {
        $this->artisan('clinic:create', [
            '--name' => 'Shifa Family Clinic',
            '--timezone' => 'Mars/Olympus',
            '--admin-name' => 'Dr. Ayesha Khan',
            '--admin-email' => 'admin@shifa.test',
        ])
            ->expectsQuestion('Admin password', 'a-long-password-1')
            ->assertFailed();

        $this->assertSame(0, Clinic::query()->count());
        $this->assertSame(0, User::query()->count());
    }
}
