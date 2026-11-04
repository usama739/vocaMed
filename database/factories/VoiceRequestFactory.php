<?php

namespace Database\Factories;

use App\Enums\VoiceSource;
use App\Enums\VoiceStatus;
use App\Models\Clinic;
use App\Models\User;
use App\Models\VoiceRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VoiceRequest>
 */
class VoiceRequestFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'clinic_id' => Clinic::factory(),
            'user_id' => User::factory(),
            'source' => VoiceSource::Text,
            'status' => VoiceStatus::Queued,
            'transcript' => 'Book Ayesha Khan with Dr. Sana tomorrow at ten',
        ];
    }

    public function forUser(User $user): static
    {
        return $this->state(fn (array $attributes) => ['clinic_id' => $user->clinic_id, 'user_id' => $user->id]);
    }

    public function status(VoiceStatus $status): static
    {
        return $this->state(fn (array $attributes) => ['status' => $status]);
    }
}
