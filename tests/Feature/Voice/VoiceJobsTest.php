<?php

namespace Tests\Feature\Voice;

use App\Enums\VoiceSource;
use App\Enums\VoiceStatus;
use App\Jobs\ProcessVoiceIntentJob;
use App\Jobs\ProcessVoiceTranscriptionJob;
use App\Jobs\PurgeVoiceAudioJob;
use App\Models\Clinic;
use App\Models\VoiceRequest;
use App\Voice\Contracts\IntentParser;
use App\Voice\Contracts\SpeechToText;
use App\Voice\IntentFailed;
use App\Voice\IntentParserManager;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use App\Voice\SpeechToTextManager;
use App\Voice\VoiceAudioStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/**
 * What the voice jobs do when the provider is slow, down or has nothing to say, and that they never act twice. The queue runs inline, so a
 * job that throws has also had its "out of tries" handler called, which is exactly what a worker does after the last try.
 */
class VoiceJobsTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    private VoiceAudioStore $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();
        Storage::fake('local');
        $this->store = app(VoiceAudioStore::class);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    /** A filed recording, waiting. */
    private function waiting(?string $bytes = 'audio-bytes', VoiceStatus $status = VoiceStatus::Queued): VoiceRequest
    {
        $request = VoiceRequest::factory()->forUser($this->reception)->status($status)->create(['source' => VoiceSource::Audio, 'transcript' => null, 'audio_mime' => 'audio/webm']);

        if ($bytes !== null) {
            $request->forceFill(['audio_path' => $this->store->put($this->clinic->id, $request->id, $bytes)])->save();
        }

        return $request;
    }

    private function fresh(VoiceRequest $request): VoiceRequest
    {
        return $this->withoutTenant(fn () => $request->fresh()) ?? $request;
    }

    private function speechAnswers(SpeechToText $driver): void
    {
        config(['vocamed.voice.speech_driver' => 'test']);
        app(SpeechToTextManager::class)->extend('test', fn () => $driver);
    }

    private function parserAnswers(IntentParser $driver): void
    {
        config(['vocamed.voice.intent_driver' => 'test']);
        app(IntentParserManager::class)->extend('test', fn () => $driver);
    }

    public function test_the_fake_drivers_carry_a_recording_all_the_way_to_a_ready_draft()
    {
        $request = $this->waiting();

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertSame(VoiceStatus::Ready, $request->status);
        $this->assertSame('book', $request->parsed_json['fields']['kind'] ?? null);
        $this->assertSame($this->doctor->id, $request->parsed_json['draft']['doctorId']);
        $this->assertNull($request->audio_path);
        $this->assertNotNull($request->purged_at);
    }

    public function test_the_provider_is_given_the_recording_in_the_format_it_was_made_in()
    {
        $seen = null;
        $this->speechAnswers(new class($seen) implements SpeechToText
        {
            public function __construct(public mixed &$seen) {}

            public function transcribe(SpeechInput $input): string
            {
                $this->seen = $input;

                return 'book someone';
            }
        });

        ProcessVoiceTranscriptionJob::dispatchSync($this->waiting('the-bytes')->id, $this->clinic->id);

        $this->assertSame('the-bytes', $seen->contents);
        $this->assertSame('recording.webm', $seen->filename);
        $this->assertSame('audio/webm', $seen->mime);
    }

    public function test_a_provider_that_is_busy_is_tried_again_and_the_request_is_failed_only_after_the_last_try()
    {
        $this->speechAnswers(new class implements SpeechToText
        {
            public function transcribe(SpeechInput $input): string
            {
                throw new SpeechFailed('rate_limited', retryable: true);
            }
        });
        $request = $this->waiting();

        // The exception leaves the job, which is what makes a worker try again.
        try {
            ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);
            $this->fail('A busy provider must make the job throw so the queue retries it.');
        } catch (SpeechFailed $e) {
            $this->assertTrue($e->retryable);
        }

        // Inline, the same run also called the "out of tries" handler.
        $request = $this->fresh($request);
        $this->assertSame(VoiceStatus::Failed, $request->status);
        $this->assertSame('rate_limited', $request->failure_code);
        $this->assertNull($request->audio_path, 'The recording is deleted even when the request failed.');
    }

    public function test_a_recording_the_provider_cannot_use_fails_at_once_without_retrying()
    {
        $this->speechAnswers(new class implements SpeechToText
        {
            public function transcribe(SpeechInput $input): string
            {
                throw new SpeechFailed('rejected');
            }
        });
        $request = $this->waiting();

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertSame([VoiceStatus::Failed, 'rejected'], [$request->status, $request->failure_code]);
        $this->assertNull($request->audio_path);
    }

    public function test_silence_fails_with_no_speech_and_goes_no_further()
    {
        $this->speechAnswers(new class implements SpeechToText
        {
            public function transcribe(SpeechInput $input): string
            {
                return "  \n ";
            }
        });
        $request = $this->waiting();

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertSame([VoiceStatus::Failed, 'no_speech'], [$request->status, $request->failure_code]);
        $this->assertNull($request->parsed_json);
    }

    public function test_a_recording_that_has_gone_missing_fails_with_audio_missing()
    {
        $request = $this->waiting(bytes: null);

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);

        $this->assertSame('audio_missing', $this->fresh($request)->failure_code);
    }

    public function test_a_request_that_is_no_longer_waiting_is_left_alone()
    {
        $request = $this->waiting('bytes', VoiceStatus::Ready);

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $this->clinic->id);
        ProcessVoiceIntentJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertSame(VoiceStatus::Ready, $request->status);
        $this->assertNull($request->transcript);
        $this->assertNotNull($request->audio_path, 'Neither job touched it.');
    }

    public function test_a_request_of_another_clinic_is_not_found_by_the_job()
    {
        $request = $this->waiting();
        $other = Clinic::factory()->create();

        ProcessVoiceTranscriptionJob::dispatchSync($request->id, $other->id);

        $this->assertSame(VoiceStatus::Queued, $this->fresh($request)->status);
    }

    public function test_the_parser_can_say_a_request_is_not_a_booking()
    {
        $this->parserAnswers(new class implements IntentParser
        {
            public function parse(string $text, ParseContext $context): ParsedIntent
            {
                return new ParsedIntent(ParsedIntent::UNSUPPORTED);
            }
        });
        $request = $this->waiting(null, VoiceStatus::Queued);
        $request->forceFill(['source' => VoiceSource::Text, 'transcript' => 'cancel my visit'])->save();

        ProcessVoiceIntentJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertSame(VoiceStatus::Ready, $request->status);
        $this->assertSame('unsupported', $request->parsed_json['fields']['kind']);
    }

    public function test_a_parser_that_cannot_read_the_text_fails_the_request_with_its_reason()
    {
        $this->parserAnswers(new class implements IntentParser
        {
            public function parse(string $text, ParseContext $context): ParsedIntent
            {
                throw new IntentFailed('unreadable');
            }
        });
        $request = $this->waiting(null);
        $request->forceFill(['source' => VoiceSource::Text, 'transcript' => '???'])->save();

        ProcessVoiceIntentJob::dispatchSync($request->id, $this->clinic->id);

        $this->assertSame('unreadable', $this->fresh($request)->failure_code);
    }

    public function test_a_parser_that_is_down_is_retried_then_failed()
    {
        $this->parserAnswers(new class implements IntentParser
        {
            public function parse(string $text, ParseContext $context): ParsedIntent
            {
                throw new IntentFailed('unavailable', retryable: true);
            }
        });
        $request = $this->waiting(null);
        $request->forceFill(['source' => VoiceSource::Text, 'transcript' => 'book'])->save();

        try {
            ProcessVoiceIntentJob::dispatchSync($request->id, $this->clinic->id);
            $this->fail('A retryable failure must leave the job.');
        } catch (IntentFailed) {
        }

        $this->assertSame([VoiceStatus::Failed, 'unavailable'], [$this->fresh($request)->status, $this->fresh($request)->failure_code]);
    }

    public function test_deleting_the_recording_twice_is_harmless()
    {
        $request = $this->waiting();
        $path = (string) $request->audio_path;

        PurgeVoiceAudioJob::dispatchSync($request->id, $this->clinic->id);
        PurgeVoiceAudioJob::dispatchSync($request->id, $this->clinic->id);

        $request = $this->fresh($request);
        $this->assertNull($request->audio_path);
        $this->assertNotNull($request->purged_at);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_the_drivers_are_settings_and_one_that_does_not_exist_yet_is_refused_plainly()
    {
        config(['vocamed.voice.speech_driver' => 'whisper_http']);
        $this->expectException(InvalidArgumentException::class);

        app(SpeechToTextManager::class)->driver();
    }
}
