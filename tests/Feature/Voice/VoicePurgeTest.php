<?php

namespace Tests\Feature\Voice;

use App\Enums\VoiceSource;
use App\Enums\VoiceStatus;
use App\Models\Clinic;
use App\Models\User;
use App\Models\VoiceRequest;
use App\Voice\Contracts\SpeechToText;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use App\Voice\SpeechToTextManager;
use App\Voice\VoiceAudioStore;
use App\Voice\VoicePurger;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * What voice requests keep and for how long: a recording goes as soon as it is read unless the clinic keeps recordings for a few days, a
 * recording nobody read goes after an hour, and the written text is erased after 30 days. Every clinic by its own setting.
 */
class VoicePurgeTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        Storage::fake('local');
        $this->keepFor(0);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    private function keepFor(int $days, ?Clinic $clinic = null): void
    {
        ($clinic ?? $this->clinic)->forceFill(['settings' => ['voiceEnabled' => true, 'voiceAudioRetentionDays' => $days]])->save();
    }

    private function speak()
    {
        return $this->actingAs($this->reception)->postJson('/api/voice/transcribe', ['audio' => UploadedFile::fake()->create('r.webm', 30, 'audio/webm'), 'durationSeconds' => 4]);
    }

    private function fresh(string $id): VoiceRequest
    {
        return $this->withoutTenant(fn () => VoiceRequest::query()->findOrFail($id));
    }

    /** A recording waiting on disk for a request made `$ago` ago. */
    private function stored(string $ago, ?string $transcript = 'Ayesha Khan tomorrow', ?Clinic $clinic = null, ?User $user = null): VoiceRequest
    {
        $clinic ??= $this->clinic;
        $user ??= $this->reception;
        $request = VoiceRequest::factory()->forUser($user)->create([
            'source' => VoiceSource::Audio,
            'status' => $transcript === null ? VoiceStatus::Queued : VoiceStatus::Ready,
            'transcript' => $transcript,
            'parsed_json' => $transcript === null ? null : ['fields' => ['kind' => 'book'], 'draft' => null],
            'audio_mime' => 'audio/webm',
            'duration_seconds' => 4,
            'created_at' => Carbon::now()->modify("-$ago"),
        ]);
        $request->forceFill(['audio_path' => app(VoiceAudioStore::class)->put($clinic->id, $request->id, 'recording-bytes')])->save();

        return $request;
    }

    public function test_a_clinic_that_keeps_nothing_loses_the_recording_as_soon_as_it_is_read()
    {
        $voice = $this->fresh($this->speak()->assertStatus(202)->json('id'));

        $this->assertSame(VoiceStatus::Ready, $voice->status);
        $this->assertNull($voice->audio_path);
        $this->assertNotNull($voice->purged_at);
        $this->assertSame([], Storage::disk('local')->allFiles('voice'));
    }

    public function test_a_clinic_that_keeps_recordings_keeps_a_read_one_until_the_sweep_finds_it_old_enough()
    {
        $this->keepFor(7);
        $voice = $this->fresh($this->speak()->assertStatus(202)->json('id'));
        $path = (string) $voice->audio_path;

        $this->assertNotSame('', $path);
        $this->assertNull($voice->purged_at);
        Storage::disk('local')->assertExists($path);
        // Waiting on disk it is still encrypted.
        $this->assertStringNotContainsString('bytes', (string) Storage::disk('local')->get($path));

        Carbon::setTestNow(now()->addDays(6));
        $this->assertSame(0, app(VoicePurger::class)->sweep()['recordings']);
        Storage::disk('local')->assertExists($path);

        Carbon::setTestNow(now()->addDays(2));
        $this->assertSame(1, app(VoicePurger::class)->sweep()['recordings']);
        Storage::disk('local')->assertMissing($path);
        $voice = $this->fresh($voice->id);
        $this->assertNull($voice->audio_path);
        $this->assertNotNull($voice->purged_at);
    }

    public function test_a_recording_that_could_not_be_read_is_deleted_at_once_even_when_the_clinic_keeps_recordings()
    {
        $this->keepFor(30);
        config(['vocamed.voice.speech_driver' => 'stand_in']);
        app(SpeechToTextManager::class)->extend('stand_in', fn () => new class implements SpeechToText
        {
            public function transcribe(SpeechInput $input): string
            {
                throw new SpeechFailed('rejected');
            }
        });

        $voice = $this->fresh($this->speak()->assertStatus(202)->json('id'));

        $this->assertSame(VoiceStatus::Failed, $voice->status);
        $this->assertNull($voice->audio_path);
        $this->assertSame([], Storage::disk('local')->allFiles('voice'));
    }

    public function test_silence_is_deleted_at_once_too()
    {
        $this->keepFor(30);
        config(['vocamed.voice.fake_transcript' => '  ']);

        $voice = $this->fresh($this->speak()->assertStatus(202)->json('id'));

        $this->assertSame('no_speech', $voice->failure_code);
        $this->assertNull($voice->audio_path);
    }

    public function test_a_recording_nobody_read_goes_after_an_hour_whatever_the_clinic_keeps()
    {
        $this->keepFor(30);
        $old = $this->stored('2 hours', transcript: null);
        $recent = $this->stored('10 minutes', transcript: null);

        $counts = app(VoicePurger::class)->sweep();

        $this->assertSame(1, $counts['recordings']);
        $this->assertNull($this->fresh($old->id)->audio_path);
        $this->assertNotNull($this->fresh($recent->id)->audio_path);
    }

    public function test_the_written_text_is_erased_after_thirty_days_but_the_row_stays()
    {
        $old = $this->stored('31 days');
        $recent = $this->stored('29 days');
        $this->keepFor(30);

        $counts = app(VoicePurger::class)->sweep();

        $this->assertSame(1, $counts['transcripts']);
        $erased = $this->fresh($old->id);
        $this->assertNull($erased->transcript);
        $this->assertNull($erased->parsed_json);
        $this->assertSame(4, $erased->duration_seconds, 'The length stays, so use can still be counted.');
        $this->assertSame('Ayesha Khan tomorrow', $this->fresh($recent->id)->transcript);
    }

    public function test_every_clinic_is_swept_by_its_own_setting()
    {
        $other = Clinic::factory()->create(['timezone' => 'Asia/Karachi']);
        $this->keepFor(30);
        $this->keepFor(0, $other);
        $stranger = User::factory()->receptionist()->forClinic($other)->create();

        $mine = $this->stored('2 days');
        $theirs = $this->stored('2 days', clinic: $other, user: $stranger);

        $counts = app(VoicePurger::class)->sweep();

        $this->assertSame(1, $counts['recordings']);
        $this->assertNotNull($this->fresh($mine->id)->audio_path, 'This clinic keeps recordings for 30 days.');
        $this->assertNull($this->fresh($theirs->id)->audio_path, 'The other keeps nothing, so a read recording left lying is cleared.');
    }

    public function test_the_command_reports_what_it_did_and_running_it_again_does_nothing()
    {
        $this->stored('2 hours', transcript: null);
        $this->stored('40 days');

        $this->artisan('voice:purge')->expectsOutput('Deleted 2 recording(s) and erased 1 transcript(s).')->assertExitCode(0);
        $this->artisan('voice:purge')->expectsOutput('Deleted 0 recording(s) and erased 0 transcript(s).')->assertExitCode(0);
    }

    public function test_the_sweep_runs_every_night()
    {
        $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'voice:purge'));

        $this->assertNotNull($event);
        $this->assertSame('0 3 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }
}
