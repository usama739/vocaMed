<?php

namespace Tests\Unit\Voice;

use App\Voice\Text\NameMatcher;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Names written in different spellings and different scripts must be recognised as the same person; different people must not. */
class NameMatcherTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string, 2: float}> heard, the clinic's name, the least score that counts as a match
     */
    public static function sameName(): array
    {
        return [
            'exact' => ['Ayesha Khan', 'Ayesha Khan', 1.0],
            'case and spacing' => ['  ayesha   KHAN ', 'Ayesha Khan', 1.0],
            'a title is not part of the name' => ['Dr. Sana', 'Sana', 1.0],
            'the clinic writes the title' => ['Sana', 'Dr. Sana', 1.0],
            'first name only' => ['Laith', 'Laith Garner', 0.9],
            'a longer name than the one on file' => ['Laith Garner Ahmed', 'Laith Garner', 0.9],
            'a spelling variant' => ['Aisha Khan', 'Ayesha Khan', 0.7],
            'another spelling' => ['Muhammad Hasan', 'Mohammad Hassan', 0.7],
            'joined or split' => ['Zain ul Abideen', 'Zainulabideen', 0.9],
            'urdu script for a latin name' => ['احمد رضا', 'Ahmed Raza', 0.8],
            'urdu script, one word' => ['حمزہ', 'Hamza Ali', 0.8],
            'a latin name for an urdu one' => ['Ahmed', 'احمد', 0.8],
            'arabic letters typed for urdu ones' => ['كامران', 'کامران', 1.0],
            'urdu names with a vowel at the start' => ['عمران', 'Imran', 0.8],
        ];
    }

    /**
     * What Groq's Whisper really returned for clear English speech of made-up names (a live check on 2026-11-04), against the name that was
     * said. Each is the same person and must still be found, though a loose one is flagged for a check (below 0.85).
     *
     * @return array<string, array{0: string, 1: string, 2: float}>
     */
    public static function heardByWhisper(): array
    {
        return [
            'Ayesha as Ahisha' => ['Ahisha Khan', 'Ayesha Khan', 0.7],
            'Raza as Rasa' => ['Ahmed Rasa', 'Ahmed Raza', 0.7],
            'Laith with an e' => ['Laithe Garner', 'Laith Garner', 0.7],
            'Laith as Lath' => ['Lath', 'Laith Garner', 0.7],
            'both words of Maryam Iqbal off' => ['Marya Mikbel', 'Maryam Iqbal', 0.7],
        ];
    }

    #[DataProvider('heardByWhisper')]
    public function test_names_as_a_speech_model_really_misheard_them_still_find_the_person(string $heard, string $name, float $atLeast)
    {
        $score = NameMatcher::score($heard, $name);

        $this->assertGreaterThanOrEqual($atLeast, $score, "$heard vs $name");
        $this->assertLessThanOrEqual(0.9, $score);
    }

    public function test_a_loose_word_by_word_match_is_never_trusted_without_a_check()
    {
        $this->assertLessThan(0.85, NameMatcher::score('Marya Mikbel', 'Maryam Iqbal'));
    }

    public function test_one_close_word_is_not_enough_when_another_word_is_a_different_name()
    {
        $this->assertLessThan(0.7, NameMatcher::score('Ayesha Khan', 'Bilal Khan'));
        $this->assertLessThan(0.7, NameMatcher::score('Marya Mikbel', 'Ayesha Khan'));
        $this->assertLessThan(0.7, NameMatcher::score('Hamza Malik', 'Hamza Ali Khan'));
    }

    #[DataProvider('sameName')]
    public function test_the_same_person_in_another_spelling_or_script_matches(string $heard, string $name, float $atLeast)
    {
        $this->assertGreaterThanOrEqual($atLeast, NameMatcher::score($heard, $name), "$heard vs $name");
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function differentName(): array
    {
        return [
            'different people' => ['Ahmed Raza', 'Fatima Noor'],
            'same surname only' => ['Ayesha Khan', 'Bilal Khan'],
            'urdu against another latin name' => ['احمد', 'Fatima'],
            'nothing heard' => ['', 'Ayesha Khan'],
            'only a title' => ['Dr', 'Ayesha Khan'],
        ];
    }

    #[DataProvider('differentName')]
    public function test_different_people_do_not_match(string $heard, string $name)
    {
        $this->assertLessThan(0.7, NameMatcher::score($heard, $name), "$heard vs $name");
    }

    public function test_the_skeleton_is_the_same_for_the_same_sounds_in_either_script()
    {
        $this->assertSame(NameMatcher::skeleton('Ahmed'), NameMatcher::skeleton('احمد'));
        $this->assertSame(NameMatcher::skeleton('Hassan'), NameMatcher::skeleton('حسن'));
        $this->assertSame(NameMatcher::skeleton('Fatima'), NameMatcher::skeleton('فاطمہ'));
        $this->assertSame(NameMatcher::skeleton('Imran'), NameMatcher::skeleton('عمران'));
    }

    public function test_scores_never_leave_the_range_and_are_symmetric_for_equal_names()
    {
        foreach ([['a', 'b'], ['Sana', 'ثناء'], ['', ''], ['x', 'x']] as [$a, $b]) {
            $score = NameMatcher::score($a, $b);

            $this->assertGreaterThanOrEqual(0.0, $score);
            $this->assertLessThanOrEqual(1.0, $score);
        }
    }
}
