<?php

namespace Tests\Unit\Voice;

use App\Voice\SpeechHints;
use PHPUnit\Framework\TestCase;

/** The spelling hint sent with a recording must name the clinic's doctors and services and never be longer than the provider allows. */
class SpeechHintsTest extends TestCase
{
    public function test_it_lists_the_doctors_and_the_services()
    {
        $this->assertSame(
            'Booking an appointment at a clinic. Doctors: Dr. Sana, Dr. Laith Garner. Services: Check-up, Follow-up.',
            SpeechHints::prompt(['Dr. Sana', 'Dr. Laith Garner'], ['Check-up', 'Follow-up'], 500),
        );
    }

    public function test_a_clinic_with_no_names_gets_no_hint()
    {
        $this->assertNull(SpeechHints::prompt([], [], 500));
    }

    public function test_names_are_left_out_whole_when_the_limit_is_reached_and_never_cut_in_half()
    {
        $prompt = SpeechHints::prompt(['Dr. Sana', 'Dr. Laith Garner', 'Dr. Hamza Ali'], ['Check-up'], 70);

        $this->assertLessThanOrEqual(70, mb_strlen((string) $prompt));
        $this->assertStringContainsString('Dr. Sana', (string) $prompt);
        $this->assertStringNotContainsString('Dr. Hamza', (string) $prompt);
        $this->assertStringEndsWith('.', (string) $prompt);
    }

    public function test_urdu_names_are_counted_in_letters_not_bytes()
    {
        $prompt = SpeechHints::prompt(['ڈاکٹر ثناء', 'ڈاکٹر لیث گارنر'], [], 100);

        $this->assertStringContainsString('ڈاکٹر لیث گارنر', (string) $prompt);
    }
}
