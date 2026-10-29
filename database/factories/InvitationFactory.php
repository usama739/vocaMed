<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Invitation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invitation>
 */
class InvitationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'clinic_id' => Clinic::factory(),
            'email' => fake()->unique()->safeEmail(),
            'role' => Role::Receptionist,
            'token_hash' => Invitation::hashToken(fake()->unique()->sha256()),
            'expires_at' => now()->addDays(7),
            'accepted_at' => null,
        ];
    }

    /** The link that carries this plain token opens this invitation. */
    public function withToken(string $token): static
    {
        return $this->state(fn (array $attributes) => ['token_hash' => Invitation::hashToken($token)]);
    }

    public function forRole(Role $role): static
    {
        return $this->state(fn (array $attributes) => ['role' => $role]);
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => ['expires_at' => now()->subMinute()]);
    }

    public function accepted(): static
    {
        return $this->state(fn (array $attributes) => ['accepted_at' => now()->subHour()]);
    }
}
