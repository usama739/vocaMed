<?php

namespace Tests\Feature\Voice;

use App\Enums\VoiceStatus;
use App\Jobs\ProcessVoiceIntentJob;
use App\Jobs\ProcessVoiceTranscriptionJob;
use App\Models\Clinic;
use App\Models\User;
use App\Models\VoiceRequest;
use App\Voice\VoiceAudioStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * The voice endpoints: who may use them, what they accept, what they answer at once, and what a screen reads back. The queue runs
 * inline in tests and both drivers are the fakes, so a request goes from accepted to ready within the call.
 */
class VoiceApiTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        Storage::fake('local');
        $this->setVoice(true);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function setVoice(bool $on): void
    {
        $this->clinic->forceFill(['settings' => ['voiceEnabled' => $on]])->save();
    }

    private function recording(int $kilobytes = 40, string $mime = 'audio/webm'): UploadedFile
    {
        return UploadedFile::fake()->create('recording.webm', $kilobytes, $mime);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function speak(User $user, array $overrides = [])
    {
        return $this->actingAs($user)->postJson('/api/voice/transcribe', ['audio' => $this->recording(), 'durationSeconds' => 4.2, ...$overrides]);
    }

    public function test_a_typed_request_is_accepted_at_once_and_comes_back_as_the_fields_that_were_understood()
    {
        $accepted = $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'Book Ayesha with Dr. Sana tomorrow at ten']);

        $accepted->assertStatus(202)->assertJsonStructure(['id', 'status']);

        $this->actingAs($this->reception)->getJson('/api/voice/'.$accepted->json('id'))
            ->assertOk()
            ->assertExactJson([
                'id' => $accepted->json('id'),
                'source' => 'text',
                'status' => 'ready',
                'transcript' => 'Book Ayesha with Dr. Sana tomorrow at ten',
                'parsed' => ['kind' => 'book', 'patientName' => 'Ayesha Khan', 'patientPhone' => null, 'doctorName' => 'Dr. Sana', 'serviceName' => null, 'date' => null, 'time' => '10:00'],
                // The fake parser always finds Ayesha Khan, Dr. Sana and 10:00; the resolver finds them in the clinic and, with no day said,
                // takes tomorrow (it is past 10:00 today) and says so.
                'draft' => [
                    'heard' => 'Book Ayesha with Dr. Sana tomorrow at ten',
                    'patientId' => $this->patient->id,
                    'patientName' => 'Ayesha Khan',
                    'phone' => $this->patient->phone,
                    'doctorId' => $this->doctor->id,
                    'serviceId' => $this->service->id,
                    'startsAt' => '2026-11-02T05:00:00.000Z',
                    'lowConfidence' => ['time'],
                ],
                'failureCode' => null,
            ]);
    }

    public function test_a_recording_is_transcribed_understood_and_deleted()
    {
        $accepted = $this->speak($this->reception)->assertStatus(202);
        $voice = $this->withoutTenant(fn () => VoiceRequest::query()->findOrFail($accepted->json('id')));

        $this->assertSame(VoiceStatus::Ready, $voice->status);
        $this->assertSame('Book Ayesha Khan with Dr. Sana tomorrow at ten', $voice->transcript);
        $this->assertSame(5, $voice->duration_seconds);
        $this->assertNull($voice->audio_path);
        $this->assertNotNull($voice->purged_at);
        $this->assertSame([], Storage::disk('local')->allFiles('voice'));

        $this->actingAs($this->reception)->getJson('/api/voice/'.$voice->id)->assertOk()->assertJson(['source' => 'audio', 'status' => 'ready', 'parsed' => ['kind' => 'book']]);
    }

    public function test_the_work_is_queued_with_only_ids_and_the_recording_waits_encrypted_on_private_disk()
    {
        Queue::fake();

        $secret = 'RAW-AUDIO-BYTES-'.str_repeat('x', 300);
        $file = UploadedFile::fake()->createWithContent('recording.webm', $secret);
        $accepted = $this->actingAs($this->reception)->postJson('/api/voice/transcribe', ['audio' => $file, 'durationSeconds' => 3])->assertStatus(202);

        Queue::assertPushed(ProcessVoiceTranscriptionJob::class, fn (ProcessVoiceTranscriptionJob $job) => $job->voiceRequestId === $accepted->json('id') && $job->clinicId === $this->clinic->id);
        Queue::assertNotPushed(ProcessVoiceIntentJob::class);
        $this->assertSame('queued', $accepted->json('status'));

        $voice = $this->withoutTenant(fn () => VoiceRequest::query()->findOrFail($accepted->json('id')));
        $stored = Storage::disk('local')->get((string) $voice->audio_path);

        $this->assertStringStartsWith('voice/'.$this->clinic->id.'/', (string) $voice->audio_path);
        $this->assertStringNotContainsString('RAW-AUDIO-BYTES', (string) $stored);
        $this->assertSame($secret, app(VoiceAudioStore::class)->get((string) $voice->audio_path));
    }

    public function test_a_typed_request_goes_straight_to_being_understood()
    {
        Queue::fake();

        $accepted = $this->actingAs($this->admin)->postJson('/api/voice/parse-text', ['text' => 'book someone'])->assertStatus(202);

        Queue::assertPushed(ProcessVoiceIntentJob::class, fn (ProcessVoiceIntentJob $job) => $job->voiceRequestId === $accepted->json('id'));
        Queue::assertNotPushed(ProcessVoiceTranscriptionJob::class);
    }

    public function test_what_was_heard_and_found_is_encrypted_in_the_database()
    {
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'Ayesha Khan 0300 1234567'])->assertStatus(202);

        $row = DB::table('voice_requests')->first();

        $this->assertStringNotContainsString('Ayesha', (string) $row->transcript);
        $this->assertStringNotContainsString('Ayesha', (string) $row->parsed_json);
    }

    #[DataProvider('endpoints')]
    public function test_a_clinic_with_voice_off_hears_voice_off_whatever_was_sent(string $uri)
    {
        $this->setVoice(false);

        $this->actingAs($this->reception)->postJson($uri, [])->assertForbidden()->assertJson(['code' => 'VOICE_OFF']);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function endpoints(): array
    {
        return ['recording' => ['/api/voice/transcribe'], 'typed text' => ['/api/voice/parse-text']];
    }

    public function test_doctors_cannot_use_voice_and_the_signed_out_are_refused()
    {
        $doctor = User::factory()->doctor()->forClinic($this->clinic)->create();

        $this->actingAs($doctor)->postJson('/api/voice/parse-text', ['text' => 'book someone'])->assertForbidden()->assertJson(['code' => 'FORBIDDEN']);
        $this->actingAs($doctor)->getJson('/api/voice/anything')->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/voice/parse-text', ['text' => 'book someone'])->assertUnauthorized();
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badRecordings(): array
    {
        return [
            'no recording' => [['audio' => null], 'audio'],
            'no length' => [['durationSeconds' => null], 'durationSeconds'],
            'longer than fifteen seconds' => [['durationSeconds' => 15.5], 'durationSeconds'],
            'a length of nothing' => [['durationSeconds' => 0], 'durationSeconds'],
            'not a number' => [['durationSeconds' => 'long'], 'durationSeconds'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badRecordings')]
    public function test_a_recording_that_breaks_the_rules_is_refused_with_the_field_named(array $overrides, string $field)
    {
        $this->speak($this->reception, $overrides)->assertStatus(422)->assertJson(['code' => 'VALIDATION', 'field' => $field]);

        $this->assertSame(0, VoiceRequest::query()->withoutGlobalScopes()->count());
    }

    public function test_a_recording_that_is_too_large_or_not_audio_is_refused()
    {
        $this->speak($this->reception, ['audio' => $this->recording(2000)])->assertStatus(422)->assertJson(['field' => 'audio']);
        $this->speak($this->reception, ['audio' => UploadedFile::fake()->create('notes.txt', 5, 'text/plain')])->assertStatus(422)->assertJson(['field' => 'audio']);
        $this->speak($this->reception, ['audio' => $this->recording(1000)])->assertStatus(202);
    }

    public function test_typed_text_must_be_there_and_not_too_long()
    {
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', [])->assertStatus(422)->assertJson(['field' => 'text']);
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => str_repeat('a', 501)])->assertStatus(422)->assertJson(['field' => 'text']);
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => str_repeat('a', 500)])->assertStatus(202);
    }

    public function test_a_request_can_only_be_read_by_the_person_who_made_it()
    {
        $id = $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'book someone'])->json('id');
        $colleague = User::factory()->receptionist()->forClinic($this->clinic)->create();
        $other = Clinic::factory()->create(['settings' => ['voiceEnabled' => true]]);
        $stranger = User::factory()->receptionist()->forClinic($other)->create();

        $this->actingAs($this->reception)->getJson("/api/voice/$id")->assertOk();
        $this->actingAs($colleague)->getJson("/api/voice/$id")->assertNotFound();
        $this->actingAs($stranger)->getJson("/api/voice/$id")->assertNotFound();
        $this->actingAs($this->reception)->getJson('/api/voice/01JZZZZZZZZZZZZZZZZZZZZZZZ')->assertNotFound();
    }

    public function test_reading_a_request_still_works_after_the_clinic_switches_voice_off()
    {
        $id = $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'book someone'])->json('id');
        $this->setVoice(false);

        $this->actingAs($this->reception)->getJson("/api/voice/$id")->assertOk()->assertJson(['status' => 'ready']);
    }

    public function test_each_person_has_a_limit_and_a_busy_clinic_does_not_use_up_everyones()
    {
        config(['vocamed.voice.limits.user' => 2, 'vocamed.voice.limits.clinic' => 3]);
        $colleague = User::factory()->receptionist()->forClinic($this->clinic)->create();

        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'one'])->assertStatus(202);
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'two'])->assertStatus(202);
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'three'])->assertStatus(429)->assertJson(['code' => 'RATE_LIMITED']);

        $this->actingAs($colleague)->postJson('/api/voice/parse-text', ['text' => 'four'])->assertStatus(202);
        // The clinic as a whole is at three: even a person who has not used their own share is now told to wait.
        $this->actingAs($colleague)->postJson('/api/voice/parse-text', ['text' => 'five'])->assertStatus(429);
    }

    public function test_recordings_share_one_system_wide_limit_that_typed_requests_do_not_touch()
    {
        config(['vocamed.voice.limits.global' => 1]);

        $this->speak($this->reception)->assertStatus(202);
        $this->speak($this->reception)->assertStatus(429)->assertJson(['code' => 'RATE_LIMITED']);
        $this->actingAs($this->reception)->postJson('/api/voice/parse-text', ['text' => 'still fine'])->assertStatus(202);
    }
}
