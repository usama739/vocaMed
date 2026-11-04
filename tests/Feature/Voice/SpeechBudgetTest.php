<?php

namespace Tests\Feature\Voice;

use App\Models\VoiceRequest;
use App\Voice\Speech\FakeSpeech;
use App\Voice\SpeechToTextManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * Keeping recordings inside the speech provider's free tier (audio seconds an hour and a day, requests a day): a busy hour is answered
 * "try again" by us, with the wait, before anything is stored or sent. Groq bills a recording as at least 10 seconds, and so do we.
 */
class SpeechBudgetTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        $this->buildBookingWorld();
        Storage::fake('local');
        $this->clinic->forceFill(['settings' => ['voiceEnabled' => true]])->save();

        // A stand-in for a real provider: any driver but "fake" is limited.
        app(SpeechToTextManager::class)->extend('budgeted', fn () => new FakeSpeech);
        config(['vocamed.voice.speech_driver' => 'budgeted', 'vocamed.voice.limits.user' => 100, 'vocamed.voice.limits.clinic' => 100, 'vocamed.voice.limits.global' => 100]);
        config(['vocamed.voice.budget' => ['audio_seconds_hour' => 0, 'audio_seconds_day' => 0, 'requests_day' => 0, 'billed_minimum_seconds' => 10]]);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /**
     * @param  array<string, int>  $limits
     */
    private function budget(array $limits): void
    {
        config(['vocamed.voice.budget' => [...config('vocamed.voice.budget'), ...$limits]]);
    }

    private function speak(float $seconds = 4.0)
    {
        return $this->actingAs($this->reception)->postJson('/api/voice/transcribe', ['audio' => UploadedFile::fake()->create('r.webm', 30, 'audio/webm'), 'durationSeconds' => $seconds]);
    }

    public function test_a_short_recording_is_billed_as_ten_seconds_so_an_hour_of_twenty_five_holds_two()
    {
        $this->budget(['audio_seconds_hour' => 25]);

        $this->speak(4)->assertStatus(202);
        $this->speak(0.5)->assertStatus(202);
        $refused = $this->speak(4)->assertStatus(429)->assertJson(['code' => 'RATE_LIMITED']);

        $this->assertGreaterThan(0, $refused->json('retryAfter'));
        $this->assertLessThanOrEqual(3600, $refused->json('retryAfter'));
        $this->assertSame(2, VoiceRequest::query()->withoutGlobalScopes()->count(), 'A refused recording is never stored.');
        $this->assertSame([], array_values(array_filter(Storage::disk('local')->allFiles('voice'), fn (string $f) => false)), 'Nothing was kept for the refused one.');
    }

    public function test_a_long_recording_is_billed_its_own_length_rounded_up()
    {
        $this->budget(['audio_seconds_hour' => 20]);

        $this->speak(14.2)->assertStatus(202);
        $this->speak(4)->assertStatus(429);
    }

    public function test_the_day_has_its_own_limit_on_seconds_and_on_requests()
    {
        $this->budget(['audio_seconds_day' => 30]);
        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(429);

        $this->budget(['audio_seconds_day' => 0, 'requests_day' => 2]);
        Cache::flush();
        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(429);
    }

    public function test_a_recording_turned_away_by_one_limit_does_not_use_up_another()
    {
        $this->budget(['audio_seconds_hour' => 100, 'audio_seconds_day' => 10]);

        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(429);

        $this->assertSame(10, Cache::get('voice:speech-budget:hour:'.now()->format('YmdH')), 'The refused recording gave its hour back.');
    }

    public function test_the_count_starts_again_in_the_next_hour()
    {
        $this->budget(['audio_seconds_hour' => 10]);

        $this->speak()->assertStatus(202);
        $this->speak()->assertStatus(429);

        Carbon::setTestNow(now()->addHour());
        $this->speak()->assertStatus(202);
    }

    public function test_a_limit_of_zero_is_no_limit()
    {
        foreach (range(1, 6) as $ignored) {
            $this->speak()->assertStatus(202);
        }
    }

    public function test_the_fake_driver_costs_nothing_and_is_never_limited()
    {
        config(['vocamed.voice.speech_driver' => 'fake']);
        $this->budget(['audio_seconds_hour' => 1, 'audio_seconds_day' => 1, 'requests_day' => 1]);

        foreach (range(1, 4) as $ignored) {
            $this->speak()->assertStatus(202);
        }
    }
}
