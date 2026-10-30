<?php

namespace Database\Factories;

use App\Models\Clinic;
use App\Models\Patient;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Patient>
 */
class PatientFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'clinic_id' => Clinic::factory(),
            'name' => fake()->unique()->name(),
            'phone' => '+92300'.fake()->unique()->numerify('#######'),
            'preferred_locale' => 'en',
            'preferred_channel' => 'sms',
            'consent_at' => null,
            'notes' => null,
        ];
    }

    public function forClinic(Clinic $clinic): static
    {
        return $this->state(fn (array $attributes) => ['clinic_id' => $clinic->id]);
    }

    public function withoutPhone(): static
    {
        return $this->state(fn (array $attributes) => ['phone' => null]);
    }

    public function consenting(): static
    {
        return $this->state(fn (array $attributes) => ['consent_at' => now()]);
    }
}
