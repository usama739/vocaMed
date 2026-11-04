<?php

namespace Tests\Feature\Voice;

use App\Voice\IntentFailed;
use App\Voice\IntentParserManager;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;
use App\Voice\Parsing\LlmIntentParser;
use App\Voice\Parsing\RulesIntentParser;
use App\Voice\Parsing\RulesThenLlmParser;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The optional language-model parser against a pretend provider (no network is ever reached), and the way it is meant to be used: the rules
 * first, the model only for a sentence the rules could not make much of, and never worse than the rules alone.
 */
class LlmParsingTest extends TestCase
{
    private const URL = 'https://llm.example.test/openai/v1';

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        config(['vocamed.voice.limits.llm_minute' => 100, 'vocamed.voice.limits.llm_day' => 1000]);
    }

    private function context(): ParseContext
    {
        return new ParseContext(CarbonImmutable::parse('2026-11-01 10:00', 'Asia/Karachi'), 'Asia/Karachi', ['Dr. Sana'], ['Check-up']);
    }

    private function llm(string $key = 'sk-test-secret'): LlmIntentParser
    {
        return new LlmIntentParser(self::URL, $key, 'openai/gpt-oss-20b', 5);
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    private function answer(array $fields): array
    {
        return ['choices' => [['message' => ['content' => json_encode([
            'kind' => 'book', 'patientName' => null, 'patientPhone' => null, 'doctorName' => null, 'serviceName' => null, 'dayWords' => null, 'timeWords' => null, 'time' => null, ...$fields,
        ])]]]];
    }

    public function test_it_asks_for_the_fields_in_a_strict_schema_and_gives_the_model_the_clinics_day_and_names()
    {
        Http::fake([self::URL.'/chat/completions' => Http::response($this->answer(['patientName' => 'Ayesha', 'doctorName' => 'Sana', 'dayWords' => 'kal', 'timeWords' => 'teen baje', 'time' => '15:00']))]);

        $intent = $this->llm()->parse('Ayesha ka appointment Dr Sana ke saath kal teen baje', $this->context());

        $this->assertSame(['Ayesha', 'Sana', '2026-11-02', '15:00'], [$intent->patientName, $intent->doctorName, $intent->date, $intent->time]);

        Http::assertSent(function (Request $request) {
            $body = $request->data();
            $user = json_decode($body['messages'][1]['content'], true);

            return $request->url() === self::URL.'/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer sk-test-secret')
                && $body['model'] === 'openai/gpt-oss-20b'
                && $body['temperature'] === 0
                && $body['response_format']['type'] === 'json_schema'
                && $body['response_format']['json_schema']['strict'] === true
                && $body['response_format']['json_schema']['schema']['additionalProperties'] === false
                && count($body['response_format']['json_schema']['schema']['required']) === 8
                && ! array_key_exists('date', $body['response_format']['json_schema']['schema']['properties'])
                && $user['today'] === '2026-11-01' && $user['weekday'] === 'Sunday' && $user['timezone'] === 'Asia/Karachi'
                && $user['doctors'] === ['Dr. Sana'] && $user['services'] === ['Check-up']
                && $user['request'] === 'Ayesha ka appointment Dr Sana ke saath kal teen baje';
        });
    }

    public function test_the_day_and_time_are_worked_out_by_the_rules_from_the_models_words_not_from_its_own_arithmetic()
    {
        // The two mistakes a live check on Groq's gpt-oss-20b made: "this Thursday" from a Sunday as the Wednesday, and 3:30 in the afternoon
        // as 13:30. The extra "date" key is ignored, whatever the model puts in it.
        Http::fake([self::URL.'/*' => Http::response($this->answer(['patientName' => 'Hira Anwar', 'dayWords' => 'this thursday', 'timeWords' => 'dopahar saade teen baje', 'time' => '13:30', 'date' => '2026-11-04']))]);

        $intent = $this->llm()->parse('Hira Anwar this thursday dopahar saade teen baje', $this->context());

        $this->assertSame(['2026-11-05', '15:30'], [$intent->date, $intent->time]);
    }

    public function test_when_the_rules_cannot_read_the_time_words_the_models_own_time_is_used_and_an_unreadable_day_is_none()
    {
        Http::fake([self::URL.'/*' => Http::response($this->answer(['dayWords' => 'sometime soon', 'timeWords' => 'two in the afternoon', 'time' => '14:00']))]);

        $intent = $this->llm()->parse('anything', $this->context());

        $this->assertNull($intent->date);
        $this->assertSame('14:00', $intent->time);
    }

    public function test_a_request_that_is_not_a_booking_comes_back_as_such()
    {
        Http::fake([self::URL.'/*' => Http::response($this->answer(['kind' => 'unsupported']))]);

        $this->assertSame(ParsedIntent::UNSUPPORTED, $this->llm()->parse('cancel my visit', $this->context())->kind);
    }

    /**
     * @return array<string, array{0: array<string, mixed>|string}>
     */
    public static function badAnswers(): array
    {
        return [
            'a kind it was not offered' => [['kind' => 'cancel']],
            'a day given as something other than words' => [['dayWords' => 5]],
            'a name given as a list' => [['patientName' => ['Ayesha']]],
            'a time that is not a time' => [['time' => '3 pm']],
            'an hour that does not exist' => [['time' => '25:00']],
            'not JSON at all' => ['I could not understand that.'],
        ];
    }

    /**
     * @param  array<string, mixed>|string  $bad
     */
    #[DataProvider('badAnswers')]
    public function test_an_answer_that_is_not_what_was_asked_for_fails_instead_of_being_booked_from(array|string $bad)
    {
        Http::fake([self::URL.'/*' => Http::response(is_string($bad)
            ? ['choices' => [['message' => ['content' => $bad]]]]
            : $this->answer($bad))]);

        try {
            $this->llm()->parse('anything', $this->context());
            $this->fail('A bad answer must throw.');
        } catch (IntentFailed $failed) {
            $this->assertSame(['invalid_output', false], [$failed->reason, $failed->retryable]);
        }
    }

    /**
     * @return array<string, array{0: int, 1: string, 2: bool}>
     */
    public static function refusals(): array
    {
        return [
            'busy' => [429, 'rate_limited', true],
            'down' => [503, 'unavailable', true],
            'wrong key' => [401, 'provider_auth', false],
            'bad request' => [400, 'rejected', false],
        ];
    }

    #[DataProvider('refusals')]
    public function test_each_refusal_says_whether_trying_again_may_help(int $status, string $reason, bool $retryable)
    {
        Http::fake([self::URL.'/*' => Http::response(['error' => ['message' => 'detail']], $status)]);

        try {
            $this->llm()->parse('anything', $this->context());
            $this->fail('A refusal must throw.');
        } catch (IntentFailed $failed) {
            $this->assertSame([$reason, $retryable], [$failed->reason, $failed->retryable]);
        }
    }

    public function test_an_unreachable_provider_may_come_back_and_a_missing_key_never_calls_out()
    {
        Http::fake(fn () => throw new ConnectionException('down'));

        try {
            $this->llm()->parse('anything', $this->context());
            $this->fail();
        } catch (IntentFailed $failed) {
            $this->assertSame(['unavailable', true], [$failed->reason, $failed->retryable]);
        }

        $this->expectExceptionObject(new IntentFailed('not_configured'));
        $this->llm('')->parse('anything', $this->context());
    }

    public function test_it_keeps_to_its_own_count_per_minute_and_never_asks_the_provider_past_it()
    {
        config(['vocamed.voice.limits.llm_minute' => 2]);
        Http::fake([self::URL.'/*' => Http::response($this->answer(['patientName' => 'A']))]);

        $this->llm()->parse('one', $this->context());
        $this->llm()->parse('two', $this->context());

        try {
            $this->llm()->parse('three', $this->context());
            $this->fail('The third call must be held back.');
        } catch (IntentFailed $failed) {
            $this->assertSame(['rate_limited', true], [$failed->reason, $failed->retryable]);
        }

        Http::assertSentCount(2);
    }

    // ---- rules first ----

    private function hybrid(): RulesThenLlmParser
    {
        return new RulesThenLlmParser(new RulesIntentParser, $this->llm());
    }

    public function test_a_sentence_the_rules_read_well_never_leaves_the_server()
    {
        Http::fake();

        $intent = $this->hybrid()->parse('Book Ayesha Khan with Dr. Sana tomorrow at 10', $this->context());

        $this->assertSame('Ayesha Khan', $intent->patientName);
        Http::assertNothingSent();
    }

    public function test_a_request_to_cancel_is_decided_by_the_rules_alone()
    {
        Http::fake();

        $this->assertSame(ParsedIntent::UNSUPPORTED, $this->hybrid()->parse('Cancel Ayesha tomorrow', $this->context())->kind);
        Http::assertNothingSent();
    }

    public function test_a_sentence_the_rules_could_barely_read_goes_to_the_model()
    {
        Http::fake([self::URL.'/*' => Http::response($this->answer(['patientName' => 'Hira Anwar', 'doctorName' => 'Sana', 'dayWords' => 'tomorrow', 'timeWords' => '11 am', 'time' => '11:00']))]);

        // Only a name is found by the rules (fewer than two of patient, doctor, day and time).
        $intent = $this->hybrid()->parse('Hira Anwar', $this->context());

        $this->assertSame(['Hira Anwar', 'Sana', '2026-11-02', '11:00'], [$intent->patientName, $intent->doctorName, $intent->date, $intent->time]);
        Http::assertSentCount(1);
    }

    public function test_when_the_model_answers_its_names_are_used_but_the_rules_own_day_and_phone_win()
    {
        Http::fake([self::URL.'/*' => Http::response($this->answer(['patientName' => 'Hira Anwar', 'patientPhone' => '0999 0000000', 'doctorName' => 'Sana', 'dayWords' => 'friday']))]);

        // The rules find a day ("tomorrow") and a phone number, but a phone number does not count towards "enough": one field, so the model is asked.
        $intent = $this->hybrid()->parse('tomorrow 0300 1234567', $this->context());

        $this->assertSame(['Hira Anwar', 'Sana', '2026-11-02', '0300 1234567'], [$intent->patientName, $intent->doctorName, $intent->date, $intent->patientPhone]);
    }

    public function test_when_the_model_cannot_help_the_rules_reading_is_kept()
    {
        Http::fake([self::URL.'/*' => Http::response([], 429)]);

        $intent = $this->hybrid()->parse('Hira Anwar', $this->context());

        $this->assertSame('Hira Anwar', $intent->patientName);
        $this->assertNull($intent->time);
    }

    public function test_when_the_rules_read_nothing_the_model_is_asked()
    {
        Http::fake([self::URL.'/*' => Http::response($this->answer(['patientName' => 'Hira']))]);

        $this->assertSame('Hira', $this->hybrid()->parse('to the at of', $this->context())->patientName);
    }

    public function test_when_the_rules_read_nothing_and_the_model_fails_that_is_the_failure()
    {
        Http::fake([self::URL.'/*' => Http::response([], 503)]);
        $this->expectException(IntentFailed::class);

        $this->hybrid()->parse('to the at of', $this->context());
    }

    public function test_the_manager_offers_all_three_and_builds_the_model_from_settings()
    {
        config(['vocamed.voice.intent' => ['base_url' => self::URL, 'api_key' => 'sk-test-secret', 'model' => 'm', 'timeout' => 5]]);
        $manager = app(IntentParserManager::class);

        $this->assertInstanceOf(RulesIntentParser::class, $manager->driver('rules'));
        $this->assertInstanceOf(RulesThenLlmParser::class, $manager->driver('rules_llm'));
        $this->assertInstanceOf(LlmIntentParser::class, $manager->driver('llm'));
    }
}
