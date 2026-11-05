<?php

namespace Tests\Feature\Voice;

use App\Models\Appointment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * Two receptionists at the same moment, each asking for the same time by voice (the "two windows" of a real clinic): each reads only
 * their own request, the first to confirm gets the slot, the second is told it is taken and offered the nearest free ones, and both
 * bookings count as voice bookings.
 */
class VoiceTwoPeopleTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    private User $colleague;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        config(['vocamed.voice.intent_driver' => 'rules']);
        $this->clinic->forceFill(['settings' => ['voiceEnabled' => true]])->save();
        $this->colleague = User::factory()->receptionist()->forClinic($this->clinic)->create();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function ask(User $by, string $text): array
    {
        $id = $this->actingAs($by)->postJson('/api/voice/parse-text', ['text' => $text])->assertStatus(202)->json('id');

        return $this->actingAs($by)->getJson("/api/voice/$id")->assertOk()->json() + ['requestId' => $id];
    }

    /**
     * @param  array<string, mixed>  $draft
     */
    private function confirm(User $by, array $draft, ?string $startsAt = null)
    {
        return $this->actingAs($by)->postJson('/api/appointments', [
            'patientId' => $draft['patientId'],
            'doctorId' => $draft['doctorId'],
            'serviceId' => $draft['serviceId'],
            'startsAt' => $startsAt ?? $draft['startsAt'],
            'source' => 'voice',
        ]);
    }

    public function test_the_first_to_confirm_gets_the_slot_and_the_second_is_offered_the_nearest_ones()
    {
        $text = 'Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am';
        $a = $this->ask($this->reception, $text);
        $b = $this->ask($this->colleague, $text);

        // Each is shown the same draft: the same free time, nothing to check.
        $this->assertSame('2026-11-03T05:00:00.000Z', $a['draft']['startsAt']);
        $this->assertSame($a['draft'], $b['draft']);
        $this->assertSame([], $a['draft']['lowConfidence']);

        $this->confirm($this->reception, $a['draft'])->assertCreated()->assertJson(['source' => 'voice']);

        $taken = $this->confirm($this->colleague, $b['draft'])->assertStatus(409)->assertJson(['code' => 'SLOT_UNAVAILABLE']);
        $alternatives = $taken->json('alternatives');

        $this->assertNotEmpty($alternatives);
        $this->assertNotSame('2026-11-03T05:00:00.000Z', $alternatives[0]['startsAt']);

        // The second person picks the nearest and books it.
        $this->confirm($this->colleague, $b['draft'], $alternatives[0]['startsAt'])->assertCreated();

        $this->assertSame(2, Appointment::query()->where('source', 'voice')->count());
    }

    public function test_each_person_reads_only_their_own_request_even_when_the_words_are_the_same()
    {
        $a = $this->ask($this->reception, 'Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am');
        $b = $this->ask($this->colleague, 'Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am');

        $this->assertNotSame($a['requestId'], $b['requestId']);
        $this->actingAs($this->colleague)->getJson('/api/voice/'.$a['requestId'])->assertNotFound();
        $this->actingAs($this->reception)->getJson('/api/voice/'.$b['requestId'])->assertNotFound();
    }

    public function test_a_draft_that_is_confirmed_twice_by_the_same_person_books_once()
    {
        $a = $this->ask($this->reception, 'Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am');

        $this->confirm($this->reception, $a['draft'])->assertCreated();
        $this->confirm($this->reception, $a['draft'])->assertStatus(409);

        $this->assertSame(1, Appointment::query()->count());
    }
}
