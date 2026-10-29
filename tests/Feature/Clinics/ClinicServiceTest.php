<?php

namespace Tests\Feature\Clinics;

use App\Data\NewClinic;
use App\Enums\ClinicStatus;
use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use App\Services\ClinicService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ClinicServiceTest extends TestCase
{
    use RefreshDatabase;

    private function newClinic(string $name = 'Shifa Family Clinic', string $email = 'admin@shifa.test'): NewClinic
    {
        return new NewClinic($name, 'PK', 'Asia/Karachi', 'en', 'Dr. Ayesha Khan', $email, 'a-long-password-1');
    }

    public function test_it_opens_an_active_clinic_with_a_verified_admin(): void
    {
        $admin = app(ClinicService::class)->create($this->newClinic());

        $clinic = $admin->clinic;
        $this->assertInstanceOf(Clinic::class, $clinic);
        $this->assertSame('shifa-family-clinic', $clinic->slug);
        $this->assertSame(ClinicStatus::Active, $clinic->fresh()?->status);
        $this->assertSame('Asia/Karachi', $clinic->timezone);

        $this->assertSame($clinic->id, $admin->clinic_id);
        $this->assertSame(Role::ClinicAdmin, $admin->role);
        $this->assertTrue($admin->is_active);
        $this->assertNotNull($admin->email_verified_at);
        $this->assertTrue(Hash::check('a-long-password-1', $admin->password));
    }

    public function test_two_clinics_with_the_same_name_get_different_slugs(): void
    {
        $first = app(ClinicService::class)->create($this->newClinic(email: 'a@shifa.test'));
        $second = app(ClinicService::class)->create($this->newClinic(email: 'b@shifa.test'));

        $this->assertNotSame($first->clinic?->slug, $second->clinic?->slug);
        $this->assertSame(2, Clinic::query()->count());
    }

    public function test_the_clinic_and_the_admin_are_created_together_or_not_at_all(): void
    {
        User::factory()->create(['email' => 'taken@shifa.test']);
        $clinicsBefore = Clinic::query()->count();

        try {
            app(ClinicService::class)->create($this->newClinic(email: 'taken@shifa.test'));
            $this->fail('A duplicate email must stop the creation.');
        } catch (\Throwable) {
            // The unique index refused the admin, so the clinic row must have been rolled back.
        }

        $this->assertSame($clinicsBefore, Clinic::query()->count());
    }

    public function test_role_and_clinic_can_not_be_mass_assigned(): void
    {
        $clinic = Clinic::factory()->create();

        $user = new User([
            'name' => 'Someone',
            'email' => 'someone@shifa.test',
            'password' => 'secret-password',
            'role' => Role::ClinicAdmin,
            'clinic_id' => $clinic->id,
            'is_active' => false,
        ]);

        $this->assertNull($user->role);
        $this->assertNull($user->clinic_id);
    }

    public function test_the_rules_reject_a_bad_timezone_country_and_a_used_email(): void
    {
        User::factory()->create(['email' => 'taken@shifa.test']);

        $validator = validator([
            'clinic' => 'Shifa',
            'country' => 'Pakistan',
            'timezone' => 'Mars/Olympus',
            'locale' => 'fr',
            'name' => 'Admin',
            'email' => 'taken@shifa.test',
            'password' => 'a-long-password-1',
        ], NewClinic::rules());

        $this->assertEqualsCanonicalizing(
            ['country', 'timezone', 'locale', 'email'],
            array_keys($validator->errors()->toArray()),
        );
        $this->expectException(ValidationException::class);
        $validator->validate();
    }

    public function test_input_is_normalised(): void
    {
        $data = NewClinic::fromValidated([
            'clinic' => '  Shifa  ',
            'country' => 'pk',
            'timezone' => 'Asia/Karachi',
            'locale' => 'en',
            'name' => ' Admin ',
            'email' => ' Admin@Shifa.TEST ',
            'password' => 'a-long-password-1',
        ]);

        $this->assertSame('Shifa', $data->clinicName);
        $this->assertSame('PK', $data->country);
        $this->assertSame('admin@shifa.test', $data->adminEmail);
    }
}
