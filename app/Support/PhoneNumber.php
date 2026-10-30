<?php

namespace App\Support;

/**
 * Phone numbers are stored in one international form (+ and 8 to 15 digits). People type them any way: with spaces,
 * dashes or brackets, with a leading 0 (local), or already international. This is the one rule, matching the screens.
 */
final class PhoneNumber
{
    /**
     * The international form of what was typed, or null when it cannot be a phone number.
     *
     * @param  string  $callingCode  the clinic's country code with the plus, such as "+92"
     */
    public static function normalize(string $raw, string $callingCode): ?string
    {
        $compact = preg_replace('/[\s\-()]/', '', $raw) ?? '';

        $international = match (true) {
            str_starts_with($compact, '+') => $compact,
            str_starts_with($compact, '0') => $callingCode.substr($compact, 1),
            default => $callingCode.$compact,
        };

        return preg_match('/^\+\d{8,15}$/', $international) === 1 ? $international : null;
    }

    /** The digits of a search text, without a leading 0 (so "0300 123" finds "+92300123…"). */
    public static function searchDigits(string $query): string
    {
        return ltrim(preg_replace('/\D/', '', $query) ?? '', '0');
    }
}
