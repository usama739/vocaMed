<?php

namespace Tests\Feature\Voice;

use App\Voice\Contracts\SpeechToText;
use App\Voice\Speech\WhisperHttpSpeech;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use App\Voice\SpeechToTextManager;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Whisper driver against a pretend provider (no network is ever reached): what it sends, what it makes of each answer, and that a
 * refusal says whether trying again may help. Groq, OpenAI and a self-hosted server all speak this same API.
 */
class WhisperHttpSpeechTest extends TestCase
{
    private const URL = 'https://speech.example.test/openai/v1';

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    private function driver(string $key = 'sk-test-secret', ?string $language = null): WhisperHttpSpeech
    {
        return new WhisperHttpSpeech(self::URL, $key, 'whisper-large-v3-turbo', $language, 5);
    }

    private function input(?string $language = null, ?string $prompt = 'Doctors: Dr. Sana.'): SpeechInput
    {
        return SpeechInput::forRecording('the-audio-bytes', 'audio/webm', $language, $prompt);
    }

    public function test_it_uploads_the_recording_with_the_model_hints_and_key_and_returns_the_trimmed_text()
    {
        Http::fake([self::URL.'/audio/transcriptions' => Http::response(['text' => "  Book Ayesha with Dr. Sana tomorrow.\n"])]);

        $text = $this->driver(language: 'ur')->transcribe($this->input());

        $this->assertSame('Book Ayesha with Dr. Sana tomorrow.', $text);

        Http::assertSent(function (Request $request) {
            $fields = collect($request->data())->mapWithKeys(fn (array $part) => [$part['name'] => $part['contents']]);
            $file = collect($request->data())->firstWhere('name', 'file');

            return $request->url() === self::URL.'/audio/transcriptions'
                && $request->hasHeader('Authorization', 'Bearer sk-test-secret')
                && $request->isMultipart()
                && $fields['model'] === 'whisper-large-v3-turbo'
                && $fields['response_format'] === 'json'
                && $fields['language'] === 'ur'
                && $fields['prompt'] === 'Doctors: Dr. Sana.'
                && $file['filename'] === 'recording.webm'
                && $file['contents'] === 'the-audio-bytes';
        });
    }

    public function test_a_language_given_with_the_recording_wins_over_the_one_in_settings_and_neither_is_sent_when_empty()
    {
        Http::fake([self::URL.'/*' => Http::response(['text' => 'ok'])]);

        $this->driver(language: 'ur')->transcribe($this->input('en', null));
        $this->driver()->transcribe($this->input(null, null));

        $sent = Http::recorded()->map(fn (array $pair) => collect($pair[0]->data())->mapWithKeys(fn (array $part) => [$part['name'] => $part['contents']])->all());

        $this->assertSame('en', $sent[0]['language']);
        $this->assertArrayNotHasKey('language', $sent[1]);
        $this->assertArrayNotHasKey('prompt', $sent[1]);
    }

    /**
     * @return array<string, array{0: int, 1: string, 2: bool}> provider status, our reason, whether trying again may help
     */
    public static function refusals(): array
    {
        return [
            'busy' => [429, 'rate_limited', true],
            'down' => [500, 'unavailable', true],
            'bad gateway' => [502, 'unavailable', true],
            'overloaded' => [503, 'unavailable', true],
            'timed out' => [408, 'unavailable', true],
            'wrong key' => [401, 'provider_auth', false],
            'not allowed' => [403, 'provider_auth', false],
            'unusable recording' => [400, 'rejected', false],
            'too large' => [413, 'rejected', false],
            'unsupported format' => [415, 'rejected', false],
        ];
    }

    #[DataProvider('refusals')]
    public function test_each_refusal_says_what_went_wrong_and_whether_trying_again_may_help(int $status, string $reason, bool $retryable)
    {
        Http::fake([self::URL.'/*' => Http::response(['error' => ['message' => 'provider detail that must not be repeated']], $status)]);

        try {
            $this->driver()->transcribe($this->input());
            $this->fail('A refusal must throw.');
        } catch (SpeechFailed $failed) {
            $this->assertSame([$reason, $retryable], [$failed->reason, $failed->retryable]);
            $this->assertStringNotContainsString('provider detail', $failed->getMessage());
            $this->assertStringNotContainsString('sk-test-secret', $failed->getMessage());
        }
    }

    public function test_a_provider_that_cannot_be_reached_may_come_back()
    {
        Http::fake(fn () => throw new ConnectionException('Could not resolve host'));

        try {
            $this->driver()->transcribe($this->input());
            $this->fail('An unreachable provider must throw.');
        } catch (SpeechFailed $failed) {
            $this->assertSame(['unavailable', true], [$failed->reason, $failed->retryable]);
        }
    }

    public function test_an_answer_with_no_text_is_a_broken_answer_not_silence()
    {
        Http::fake([self::URL.'/*' => Http::response(['unexpected' => 'shape'])]);

        $this->expectException(SpeechFailed::class);

        $this->driver()->transcribe($this->input());
    }

    public function test_silence_comes_back_as_empty_text_for_the_job_to_turn_into_no_speech()
    {
        Http::fake([self::URL.'/*' => Http::response(['text' => ' '])]);

        $this->assertSame('', $this->driver()->transcribe($this->input()));
    }

    public function test_without_a_key_it_fails_at_once_and_never_calls_out()
    {
        try {
            $this->driver(key: '')->transcribe($this->input());
            $this->fail('A missing key must throw.');
        } catch (SpeechFailed $failed) {
            $this->assertSame(['not_configured', false], [$failed->reason, $failed->retryable]);
        }

        Http::assertNothingSent();
    }

    public function test_the_manager_builds_it_from_the_settings_and_an_empty_language_means_none()
    {
        config(['vocamed.voice.speech_driver' => 'whisper_http', 'vocamed.voice.speech' => ['base_url' => self::URL, 'api_key' => 'sk-test-secret', 'model' => 'm', 'language' => '', 'timeout' => 5]]);
        Http::fake([self::URL.'/*' => Http::response(['text' => 'hello'])]);

        $driver = app(SpeechToTextManager::class)->driver();

        $this->assertInstanceOf(WhisperHttpSpeech::class, $driver);
        $this->assertInstanceOf(SpeechToText::class, $driver);
        $this->assertSame('hello', $driver->transcribe($this->input(null, null)));

        Http::assertSent(fn (Request $request) => collect($request->data())->pluck('name')->doesntContain('language') && collect($request->data())->firstWhere('name', 'model')['contents'] === 'm');
    }
}
