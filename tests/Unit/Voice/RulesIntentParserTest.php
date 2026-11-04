<?php

namespace Tests\Unit\Voice;

use App\Voice\Evaluation\PhraseEvaluator;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;
use App\Voice\Parsing\RulesIntentParser;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The rules parser, measured two ways: on the phrase sets (the tuned set must be read completely right, the held-out set must stay
 * above a floor), and one rule at a time. "Now" is Sunday 2026-11-01 10:00 in Karachi.
 */
class RulesIntentParserTest extends TestCase
{
    private RulesIntentParser $parser;

    protected function setUp(): void
    {
        $this->parser = new RulesIntentParser;
    }

    /**
     * @param  list<string>  $doctors
     * @param  list<string>  $services
     */
    private function parse(string $text, array $doctors = [], array $services = [], string $now = '2026-11-01 10:00'): ParsedIntent
    {
        return $this->parser->parse($text, new ParseContext(CarbonImmutable::parse($now, 'Asia/Karachi'), 'Asia/Karachi', $doctors, $services));
    }

    private function fixture(string $name): string
    {
        return dirname(__DIR__, 2)."/fixtures/voice/$name.json";
    }

    public function test_the_tuned_phrase_set_is_read_completely_right()
    {
        $report = (new PhraseEvaluator($this->parser))->run($this->fixture('phrases'));

        $this->assertGreaterThanOrEqual(50, $report['total'], 'The accuracy set only ever grows.');
        $this->assertSame([], $report['misses'], json_encode($report['misses'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $this->assertEqualsCanonicalizing(['en', 'roman', 'ur', 'mixed'], array_keys($report['languages']), 'English, Roman Urdu, Urdu script and mixed sentences are all covered.');
    }

    public function test_the_held_out_set_stays_above_its_floor()
    {
        $report = (new PhraseEvaluator($this->parser))->run($this->fixture('holdout'));

        // The first blind reading of this set was 16 of 20. Falling under that means a rule got worse.
        $this->assertGreaterThanOrEqual(16, $report['passed'], json_encode($report['misses'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    /**
     * @return array<string, array{0: string, 1: string}> what is said, the time it means
     */
    public static function times(): array
    {
        return [
            '7 am' => ['at 7 am', '07:00'],
            '7 with no part of the day is the morning' => ['at 7', '07:00'],
            '11 is the morning' => ['at 11', '11:00'],
            '12 is noon' => ['at 12', '12:00'],
            '12 am is midnight' => ['at 12 am', '00:00'],
            '1 to 6 is the afternoon' => ['at 6', '18:00'],
            '9 pm' => ['at 9 pm', '21:00'],
            '24 hour clock' => ['at 15:20', '15:20'],
            'a leading zero is 24 hour' => ['at 09:30', '09:30'],
            'dots for minutes' => ['at 10.45', '10:45'],
            'night' => ['raat 9 baje', '21:00'],
            'morning in roman urdu' => ['subah 6 baje', '06:00'],
            'quarter to' => ['quarter to 4', '15:45'],
            'quarter past' => ['quarter past 10', '10:15'],
            'ten thirty in words' => ['at ten thirty', '10:30'],
            'urdu digits' => ['کل ۳ بجے', '15:00'],
            'urdu script ten' => ['صبح دس بجے', '10:00'],
        ];
    }

    #[DataProvider('times')]
    public function test_a_time_is_read_the_way_a_clinic_day_means_it(string $said, string $time)
    {
        $this->assertSame($time, $this->parse("Ahmed $said")->time, $said);
    }

    public function test_a_number_that_is_not_a_time_is_not_taken_for_one()
    {
        $this->assertNull($this->parse('Book Ahmed 3 tomorrow')->time);
        $this->assertNull($this->parse('Ahmed kar do kal')->time, '"do" here is "please", not two');
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string|null}> text, now, the day it means
     */
    public static function dates(): array
    {
        return [
            'today' => ['Ahmed today', '2026-11-01 10:00', '2026-11-01'],
            'tomorrow' => ['Ahmed tomorrow', '2026-11-01 10:00', '2026-11-02'],
            'a month end' => ['Ahmed tomorrow', '2026-11-30 10:00', '2026-12-01'],
            'a year end' => ['Ahmed kal', '2026-12-31 10:00', '2027-01-01'],
            'a weekday said on that weekday is a week away' => ['Ahmed monday', '2026-11-02 10:00', '2026-11-09'],
            'the next weekday' => ['Ahmed friday', '2026-11-01 10:00', '2026-11-06'],
            'next and this change nothing more' => ['Ahmed next friday', '2026-11-01 10:00', '2026-11-06'],
            'the day after tomorrow in roman urdu' => ['Ahmed parson', '2026-11-01 10:00', '2026-11-03'],
            'a date with a month' => ['Ahmed 15 november', '2026-11-01 10:00', '2026-11-15'],
            'a month first' => ['Ahmed november 15th', '2026-11-01 10:00', '2026-11-15'],
            'a date that has passed this year is next year' => ['Ahmed 15 january', '2026-11-01 10:00', '2027-01-15'],
            'day and month with a slash' => ['Ahmed 15/11', '2026-11-01 10:00', '2026-11-15'],
            'month first with a slash' => ['Ahmed 11/15', '2026-11-01 10:00', '2026-11-15'],
            'with a year' => ['Ahmed 15-11-2027', '2026-11-01 10:00', '2027-11-15'],
            'the 30th' => ['Ahmed on the 30th', '2026-11-01 10:00', '2026-11-30'],
            'the 3rd of this month has passed, so next month' => ['Ahmed on the 3rd', '2026-11-05 10:00', '2026-12-03'],
            'a day that does not exist' => ['Ahmed 31 november', '2026-11-01 10:00', null],
            'urdu script today' => ['احمد آج', '2026-11-01 10:00', '2026-11-01'],
            'urdu numerals' => ['احمد ۱۵ نومبر', '2026-11-01 10:00', '2026-11-15'],
            'no day at all' => ['Ahmed with Dr Sana', '2026-11-01 10:00', null],
        ];
    }

    #[DataProvider('dates')]
    public function test_a_day_is_worked_out_from_the_clinics_own_today(string $said, string $now, ?string $date)
    {
        $this->assertSame($date, $this->parse($said, now: $now)->date, $said);
    }

    public function test_a_phone_number_is_taken_out_before_anything_else_can_mistake_it_for_a_time()
    {
        $intent = $this->parse('Book Hina with Dr Sana 0300 1234567 tomorrow');

        $this->assertSame('0300 1234567', $intent->patientPhone);
        $this->assertNull($intent->time);
        $this->assertSame('Hina', $intent->patientName);

        $this->assertSame('+92 300 1234567', $this->parse('Hina +92 300 1234567')->patientPhone);
        $this->assertSame('0300 1234567', $this->parse('حنا ۰۳۰۰ ۱۲۳۴۵۶۷')->patientPhone);
        $this->assertNull($this->parse('Hina on 15 11 2026')->patientPhone, 'A date is not a phone number.');
    }

    public function test_the_clinics_own_names_find_a_doctor_said_without_a_title_and_a_service_by_any_spelling()
    {
        $with = $this->parse('Hina Tariq checkup tomorrow Hamza at 3', ['Dr. Hamza Ali', 'Sana'], ['Check-up', 'Follow-up']);
        $without = $this->parse('Hina Tariq checkup tomorrow Hamza at 3');

        $this->assertSame('Hamza', $with->doctorName);
        $this->assertSame('checkup', $with->serviceName);
        $this->assertSame('Hina Tariq', $with->patientName);
        $this->assertNull($without->serviceName, 'Without the clinic\'s list a service is not guessed.');
    }

    public function test_a_title_followed_by_the_patient_stops_at_the_doctors_name_when_the_doctors_are_known()
    {
        $this->assertSame('Sana', $this->parse('Dr Sana Bilal Ahmed', ['Sana'])->doctorName);
        $this->assertSame('Bilal Ahmed', $this->parse('Dr Sana Bilal Ahmed', ['Sana'])->patientName);
        $this->assertSame('Laith Garner', $this->parse('Dr Laith Garner Ahmed', ['Laith Garner'])->doctorName);
    }

    public function test_a_request_to_cancel_move_or_look_up_is_not_a_booking()
    {
        foreach (['Cancel Ahmed tomorrow', 'reschedule Ahmed to friday', 'please move my appointment', 'when is my appointment', 'احمد کی اپائنٹمنٹ منسوخ کریں', 'Ahmed ka appointment badal do', 'Ahmed ka appointment cancel karo'] as $text) {
            $this->assertSame(ParsedIntent::UNSUPPORTED, $this->parse($text)->kind, $text);
        }
    }

    public function test_a_booking_word_alone_is_still_a_booking_with_nothing_filled_in()
    {
        $intent = $this->parse('book appointment');

        $this->assertSame(ParsedIntent::BOOK, $intent->kind);
        $this->assertNull($intent->patientName);
        $this->assertNull($intent->date);
    }

    public function test_words_that_say_nothing_are_unreadable()
    {
        $this->expectException(IntentFailed::class);

        $this->parse('to the at of');
    }

    public function test_names_typed_in_lower_case_get_capitals_and_names_with_capitals_are_left_alone()
    {
        $this->assertSame('Ayesha Khan', $this->parse('book ayesha khan tomorrow')->patientName);
        $this->assertSame('McDonald Ali', $this->parse('book McDonald Ali tomorrow')->patientName);
    }

    public function test_the_same_text_always_gives_the_same_answer()
    {
        $text = 'Ayesha ka appointment Dr Sana ke saath kal teen baje';

        $this->assertEquals($this->parse($text), $this->parse($text));
    }
}
