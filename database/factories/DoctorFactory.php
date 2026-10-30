<?php

namespace Database\Factories;

use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Doctor>
 */
class DoctorFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'clinic_id' => Clinic::factory(),
            'user_id' => null,
            'display_name' => 'Dr. '.fake()->unique()->name(),
            'specialty' => 'General physician',
            'languages' => ['en', 'ur'],
            'is_active' => true,
        ];
    }

    public function forClinic(Clinic $clinic): static
    {
        return $this->state(fn (array $attributes) => ['clinic_id' => $clinic->id]);
    }

    /** The doctor who signs in as this person. */
    public function forUser(User $user): static
    {
        return $this->state(fn (array $attributes) => ['clinic_id' => $user->clinic_id, 'user_id' => $user->id]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => false]);
    }
}
