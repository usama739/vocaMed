<?php

namespace Tests\Feature\Voice;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * Typed and spoken requests through the whole pipeline with the real rules parser and resolver (only the speech step is the fake): what a
 * receptionist's screen would read back, in English, Roman Urdu and Urdu script. Now is Sunday 2026-11-01 15:00 in the clinic.
 */
class VoiceUnderstandingTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        Storage::fake('local');
        config(['vocamed.voice.intent_driver' => 'rules']);
        $this->clinic->forceFill(['settings' => ['voiceEnabled' => true]])->save();
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function typed(string $text): array
    {
        $id = $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => $text])->assertStatus(202)->json('id');

        return $this->actingAs($this->reception)->getJson("/api/voice/$id")->assertOk()->json();
    }

    public function test_an_english_request_becomes_a_complete_draft_with_nothing_to_check()
    {
        $read = $this->typed('Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am');

        $this->assertSame('ready', $read['status']);
        $this->assertSame('Ayesha Khan', $read['parsed']['patientName']);
        $this->assertSame([
            'heard' => 'Book Ayesha Khan with Dr. Sana on 2026-11-03 at 10 am',
            'patientId' => $this->patient->id,
            'patientName' => 'Ayesha Khan',
            'phone' => (string) $this->patient->phone,
            'doctorId' => $this->doctor->id,
            'serviceId' => $this->service->id,
            'startsAt' => '2026-11-03T05:00:00.000Z',
            'lowConfidence' => [],
        ], $read['draft']);
    }

    public function test_a_roman_urdu_request_with_a_spoken_day_and_time()
    {
        $read = $this->typed('Ayesha Khan ka appointment Dr Sana ke saath kal subah das baje');

        $this->assertSame('2026-11-02T05:00:00.000Z', $read['draft']['startsAt']);
        $this->assertSame($this->patient->id, $read['draft']['patientId']);
        $this->assertSame([], $read['draft']['lowConfidence']);
    }

    public function test_an_urdu_script_request_finds_a_latin_patient_and_asks_for_a_check_on_the_short_doctor_name()
    {
        $read = $this->typed('عائشہ خان کی اپائنٹمنٹ ڈاکٹر ثناء کے ساتھ کل دس بجے');

        $this->assertSame($this->patient->id, $read['draft']['patientId']);
        $this->assertSame($this->doctor->id, $read['draft']['doctorId']);
        $this->assertSame('2026-11-02T05:00:00.000Z', $read['draft']['startsAt']);
        // A three-letter name in another script is a good guess, not a certainty, so the card highlights it.
        $this->assertSame(['doctor'], $read['draft']['lowConfidence']);
    }

    public function test_a_recording_goes_through_the_same_understanding()
    {
        config(['vocamed.voice.fake_transcript' => 'Ayesha Khan ka appointment Dr Sana ke saath kal teen baje']);

        $id = $this->actingAs($this->reception)->postJson('/api/voice/transcribe', ['audio' => UploadedFile::fake()->create('r.webm', 30, 'audio/webm'), 'durationSeconds' => 4])->assertStatus(202)->json('id');
        $read = $this->actingAs($this->reception)->getJson("/api/voice/$id")->json();

        $this->assertSame('audio', $read['source']);
        $this->assertSame('Ayesha Khan ka appointment Dr Sana ke saath kal teen baje', $read['transcript']);
        $this->assertSame('2026-11-02T10:00:00.000Z', $read['draft']['startsAt']);
    }

    public function test_a_request_to_cancel_is_ready_without_a_draft_so_the_screen_can_say_to_use_the_screens()
    {
        $read = $this->typed('Cancel Ayesha Khan appointment tomorrow');

        $this->assertSame('ready', $read['status']);
        $this->assertSame('unsupported', $read['parsed']['kind']);
        $this->assertNull($read['draft']);
    }

    public function test_words_that_say_nothing_fail_the_request_with_unreadable()
    {
        $read = $this->typed('to the at of');

        $this->assertSame('failed', $read['status']);
        $this->assertSame('unreadable', $read['failureCode']);
    }

    public function test_a_time_the_doctor_cannot_do_is_proposed_as_the_nearest_and_flagged()
    {
        // The doctor stops at 17:00.
        $read = $this->typed('Book Ayesha Khan with Dr Sana on 2026-11-03 at 7 pm');

        $this->assertSame(['time'], $read['draft']['lowConfidence']);
        $this->assertSame('2026-11-03T11:30:00.000Z', $read['draft']['startsAt']);
    }

    public function test_the_clinics_own_doctor_names_find_a_doctor_said_without_a_title()
    {
        $read = $this->typed('Book Ayesha Khan with Sana on 2026-11-03 at 11 am');

        $this->assertSame($this->doctor->id, $read['draft']['doctorId']);
        $this->assertSame('Sana', $read['parsed']['doctorName']);
    }
}
