<?php

namespace Tests\Feature\Voice;

use App\Voice\Contracts\SpeechToText;
use App\Voice\Evaluation\AudioEvaluator;
use App\Voice\Parsing\RulesIntentParser;
use App\Voice\SpeechFailed;
use App\Voice\SpeechInput;
use App\Voice\SpeechToTextManager;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * `voice:evaluate --audio`: real recordings through the speech driver, measured, and kept gentle on a free tier. The driver here is a
 * stand-in, so no network is reached and nothing is spent.
 */
class VoiceAudioEvaluateTest extends TestCase
{
    private string $folder;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        $this->folder = storage_path('framework/testing/voice-audio-'.uniqid());
        File::ensureDirectoryExists($this->folder);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->folder);

        parent::tearDown();
    }

    /** @param  list<string>  $names */
    private function recordings(array $names): void
    {
        foreach ($names as $name) {
            file_put_contents("{$this->folder}/$name", 'audio');
        }
    }

    private function hears(string|callable $answer): void
    {
        config(['vocamed.voice.speech_driver' => 'stand_in']);
        app(SpeechToTextManager::class)->extend('stand_in', fn () => new class($answer) implements SpeechToText
        {
            public int $calls = 0;

            public function __construct(private $answer) {}

            public function transcribe(SpeechInput $input): string
            {
                $this->calls++;

                return is_callable($this->answer) ? ($this->answer)($input, $this->calls) : $this->answer;
            }
        });
    }

    public function test_a_transcript_that_matches_what_was_said_scores_no_word_errors_and_every_field_right()
    {
        $this->recordings(['01.wav']);
        $this->hears('Book Ayesha Khan with Dr. Sana tomorrow at 10');

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0])
            ->expectsOutputToContain('word error: 0%')
            ->expectsOutputToContain('fields:     all right')
            ->expectsOutputToContain('1 of 1 recordings gave a transcript; 1 of those read completely right')
            ->assertExitCode(0);
    }

    public function test_a_misheard_name_shows_in_the_word_error_and_in_the_field_that_went_wrong()
    {
        $this->recordings(['01.wav']);
        $this->hears('Book Aisha Khan with Dr. Sana tomorrow at 10');

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0])
            ->expectsOutputToContain('fields wrong: patientName')
            ->assertExitCode(0);
    }

    public function test_recordings_are_matched_to_phrases_by_number_and_only_up_to_the_limit()
    {
        $this->recordings(['02.webm', '05.mp3', '7.ogg', '09.flac']);
        $this->hears('anything');

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0, '--limit' => 3])
            ->expectsOutputToContain('#2 (02.webm)')
            ->expectsOutputToContain('#5 (05.mp3)')
            ->expectsOutputToContain('#7 (7.ogg)')
            ->doesntExpectOutputToContain('#9')
            ->expectsOutputToContain('This run used 3 request(s), billed by the provider as at least 30 audio seconds')
            ->assertExitCode(0);
    }

    public function test_the_clinics_names_go_along_as_a_hint_and_the_recording_format_is_kept()
    {
        $this->recordings(['01.webm']);
        $seen = null;
        $this->hears(function (SpeechInput $input) use (&$seen) {
            $seen = $input;

            return 'Book Ayesha Khan with Dr. Sana tomorrow at 10';
        });

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0])->assertExitCode(0);

        $this->assertSame('audio/webm', $seen->mime);
        $this->assertSame('Booking an appointment at a clinic. Doctors: Sana, Laith Garner, Hamza Ali. Services: Check-up, Consultation, Follow-up, Dental cleaning.', $seen->prompt);
    }

    public function test_it_stops_at_the_first_busy_instead_of_pushing_on()
    {
        $this->recordings(['01.wav', '02.wav', '03.wav']);
        $this->hears(fn (SpeechInput $input, int $call) => $call === 2 ? throw new SpeechFailed('rate_limited', true) : 'Book Ayesha Khan');

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0])
            ->expectsOutputToContain('failed:     rate_limited')
            ->doesntExpectOutputToContain('#3')
            ->expectsOutputToContain('1 of 2 recordings gave a transcript')
            ->assertExitCode(1);
    }

    public function test_it_says_so_when_there_is_nothing_to_play_or_the_set_cannot_be_numbered()
    {
        $this->hears('x');

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'phrases', '--pace' => 0])
            ->expectsOutputToContain('No recordings found')
            ->assertExitCode(2);

        $this->artisan('voice:evaluate', ['--audio' => $this->folder, '--set' => 'all'])
            ->expectsOutputToContain('phrases or holdout')
            ->assertExitCode(2);

        $this->artisan('voice:evaluate', ['--audio' => $this->folder.'-missing', '--set' => 'phrases'])->assertExitCode(2);
    }

    public function test_the_word_error_rate_counts_words_not_letters()
    {
        $evaluator = new AudioEvaluator(new class implements SpeechToText
        {
            public function transcribe(SpeechInput $input): string
            {
                return '';
            }
        }, new RulesIntentParser);

        $this->assertSame(0.0, $evaluator->wordErrorRate('Book Ayesha, tomorrow!', 'book ayesha tomorrow'));
        $this->assertEqualsWithDelta(0.25, $evaluator->wordErrorRate('book ayesha with sana', 'book ayesha with sanaa'), 0.0001);
        $this->assertEqualsWithDelta(0.5, $evaluator->wordErrorRate('book ayesha', 'book'), 0.0001);
        $this->assertSame(1.0, $evaluator->wordErrorRate('', 'extra'));
        $this->assertSame(0.0, $evaluator->wordErrorRate('', ''));
        // "تین" said and "3" heard is one word of three wrong.
        $this->assertEqualsWithDelta(1 / 3, $evaluator->wordErrorRate('کل تین بجے', 'کل ۳ بجے'), 0.0001);
    }
}
