<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'clinic_id' => Clinic::factory(),
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Receptionist,
            'locale' => 'en',
            'is_active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function clinicAdmin(): static
    {
        return $this->state(fn (array $attributes) => ['role' => Role::ClinicAdmin]);
    }

    public function receptionist(): static
    {
        return $this->state(fn (array $attributes) => ['role' => Role::Receptionist]);
    }

    public function doctor(): static
    {
        return $this->state(fn (array $attributes) => ['role' => Role::Doctor]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => false]);
    }

    public function forClinic(Clinic $clinic): static
    {
        return $this->state(fn (array $attributes) => ['clinic_id' => $clinic->id]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
