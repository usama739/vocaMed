<?php

namespace App\Voice\Text;

/**
 * Makes the many ways of writing the same thing compare equal: Arabic-Indic and Urdu digits become 0 to 9, the Arabic forms of
 * letters Urdu typists mix in (ي, ك, ة) become the Urdu ones, vowel marks and stretching lines disappear, and Latin letters are lower
 * case. It never removes a word, so the position of a word is the same before and after.
 */
final class Folding
{
    private const MAP = [
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        'ي' => 'ی', 'ى' => 'ی', 'ك' => 'ک', 'ة' => 'ہ', 'ۃ' => 'ہ', 'ۀ' => 'ہ', 'ە' => 'ہ', 'ۓ' => 'ے',
        'أ' => 'ا', 'إ' => 'ا', 'ٱ' => 'ا', '’' => "'", '‘' => "'", '“' => '"', '”' => '"', '–' => '-', '—' => '-',
    ];

    /** Only the digits: Arabic-Indic and Urdu numerals become 0 to 9, everything else is left as it was written. */
    public static function digits(string $text): string
    {
        return strtr($text, array_filter(self::MAP, fn (string $to) => ctype_digit($to)));
    }

    public static function fold(string $text): string
    {
        $text = strtr($text, self::MAP);
        // Vowel marks, the stretching line and invisible joiners and direction marks.
        $text = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}\x{200B}-\x{200F}\x{202A}-\x{202E}]/u', '', $text) ?? $text;

        return mb_strtolower($text);
    }
}
