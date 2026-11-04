<?php

namespace App\Voice\Text;

/**
 * How alike two names are, from 0 (nothing) to 1 (the same), across spellings and across scripts. A name heard in a recording may be
 * written in Latin letters ("Ayesha") or in Urdu ("عائشہ") while the clinic keeps it the other way, so besides comparing letters it
 * compares a sound skeleton: the consonants in a common alphabet, with vowels dropped (a vowel only counts at the start of a word).
 * It is approximate on purpose; whatever it finds is shown on the review card for a person to check.
 */
final class NameMatcher
{
    /** Titles and polite words that are not part of a name. */
    private const TITLES = ['dr', 'doctor', 'doc', 'daktar', 'doktar', 'dactar', 'mr', 'mrs', 'ms', 'miss', 'sir', 'madam', 'sahab', 'sahib', 'saheb', 'صاحب', 'صاحبہ', 'ڈاکٹر', 'ڈاکٹرصاحب', 'مسٹر', 'مس'];

    /** Urdu letters to the skeleton's alphabet. Lower case is a plain consonant, upper case a pair of letters (S = sh, K = kh). */
    private const URDU = [
        'ب' => 'b', 'پ' => 'p', 'ت' => 't', 'ٹ' => 't', 'ث' => 's', 'ج' => 'j', 'چ' => 'C', 'ح' => 'h', 'خ' => 'K', 'د' => 'd', 'ڈ' => 'd',
        'ذ' => 'z', 'ر' => 'r', 'ڑ' => 'r', 'ز' => 'z', 'ژ' => 'Z', 'س' => 's', 'ش' => 'S', 'ص' => 's', 'ض' => 'z', 'ط' => 't', 'ظ' => 'z',
        'غ' => 'G', 'ف' => 'f', 'ق' => 'k', 'ک' => 'k', 'گ' => 'g', 'ل' => 'l', 'م' => 'm', 'ن' => 'n', 'ں' => 'n', 'ہ' => 'h',
    ];

    /** Urdu letters that only carry a vowel or a glide; at the start of a word they count as a vowel. */
    private const URDU_VOWELS = ['ا', 'آ', 'ع', 'ء', 'ئ', 'ؤ', 'و', 'ی', 'ے', 'ۓ'];

    /** The best score of the heard text against the candidate name. */
    public static function score(string $heard, string $candidate): float
    {
        $a = self::normalize($heard);
        $b = self::normalize($candidate);

        if ($a === '' || $b === '') {
            return 0.0;
        }

        if ($a === $b) {
            return 1.0;
        }

        $ta = explode(' ', $a);
        $tb = explode(' ', $b);
        $best = 0.0;

        if (str_replace(' ', '', $a) === str_replace(' ', '', $b)) {
            $best = 0.95;
        }

        // Every word that was said is a word (or the start of a word) of the candidate: a first name alone, or "Laith" for "Laith Garner".
        if (self::everyWordIn($ta, $tb)) {
            $best = max($best, 0.92);
        }

        if (self::everyWordIn($tb, $ta)) {
            $best = max($best, 0.9);
        }

        $sa = self::skeleton($a);
        $sb = self::skeleton($b);

        if ($sa !== '' && $sa === $sb) {
            $best = max($best, strlen($sa) >= 3 ? 0.85 : (strlen($sa) === 2 ? 0.75 : 0.6));
        } elseif ($sa !== '' && $sb !== '' && strlen($sa) >= 3 && self::distance($sa, $sb) <= 1) {
            $best = max($best, 0.7);
        }

        // Each said word sounds like some word of the candidate ("ayesha" and "عائشہ" are both "aS").
        if (self::everySoundIn($ta, $tb)) {
            $best = max($best, 0.8);
        }

        $similarity = 1 - self::distance($a, $b) / max(mb_strlen($a), mb_strlen($b));

        if ($similarity >= 0.75) {
            $best = max($best, round($similarity * 0.95, 3));
        }

        return max($best, self::wordByWord($ta, $tb));
    }

    /**
     * Every word said is close to some word of the candidate, each spelled a little differently ("Marya Mikbel" for "Maryam Iqbal"): the
     * average of how close each is. It is never above 0.84, so a match this loose is always shown for a person to check.
     *
     * @param  list<string>  $said
     * @param  list<string>  $of
     */
    private static function wordByWord(array $said, array $of): float
    {
        $total = 0.0;

        foreach ($said as $word) {
            $top = 0.0;

            foreach ($of as $candidate) {
                $top = max($top, self::wordScore($word, $candidate));
            }

            if ($top < 0.7) {
                return 0.0;
            }

            $total += $top;
        }

        return $said === [] ? 0.0 : min(0.84, $total / count($said));
    }

    /** How alike two single words are: the same, a near spelling, or the same sounds. */
    private static function wordScore(string $a, string $b): float
    {
        if ($a === $b) {
            return 1.0;
        }

        $similarity = 1 - self::distance($a, $b) / max(mb_strlen($a), mb_strlen($b));
        $score = $similarity >= 0.75 ? round($similarity * 0.95, 3) : 0.0;
        $sa = self::wordSkeleton($a);
        $sb = self::wordSkeleton($b);

        if ($sa !== '' && $sa === $sb && strlen($sa) >= 3) {
            return max($score, 0.85);
        }

        return $sa !== '' && $sb !== '' && strlen($sa) >= 3 && self::distance($sa, $sb) <= 1 ? max($score, 0.7) : $score;
    }

    /** Lower case, one script's look-alikes folded, titles and punctuation removed, words separated by single spaces. */
    public static function normalize(string $name): string
    {
        $folded = Folding::fold($name);
        $folded = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $folded) ?? $folded;
        $words = array_filter(preg_split('/\s+/u', trim($folded)) ?: [], fn (string $w) => $w !== '' && ! in_array($w, self::TITLES, true));

        return implode(' ', $words);
    }

    /** The sounds of a name in one alphabet (see the class note). Words are kept apart by a space. */
    public static function skeleton(string $name): string
    {
        $words = [];

        foreach (explode(' ', self::normalize($name)) as $word) {
            $sound = self::wordSkeleton($word);

            if ($sound !== '') {
                $words[] = $sound;
            }
        }

        return implode(' ', $words);
    }

    private static function wordSkeleton(string $word): string
    {
        $chars = mb_str_split($word);
        $out = '';
        $count = count($chars);

        for ($i = 0; $i < $count; $i++) {
            $c = $chars[$i];
            $next = $chars[$i + 1] ?? '';
            $atStart = $out === '';

            if (isset(self::URDU[$c])) {
                // ہ at the end of a word is the vowel "a" (Ayesha, Hamza); inside a word it is an h.
                if ($c === 'ہ' && $next === '') {
                    continue;
                }

                $out .= self::URDU[$c];

                continue;
            }

            if ($c === 'ھ') {
                // The aspirate mark after k or g makes kh or gh; after the other letters it adds nothing we compare.
                if ($out !== '' && in_array(substr($out, -1), ['k', 'g'], true)) {
                    $out = substr($out, 0, -1).($out[-1] === 'k' ? 'K' : 'G');
                }

                continue;
            }

            if (in_array($c, self::URDU_VOWELS, true)) {
                $out .= $atStart ? 'a' : '';

                continue;
            }

            if (preg_match('/^[a-z]$/', $c) === 1) {
                $pair = $c.$next;

                if (in_array($pair, ['sh', 'ch', 'kh', 'gh', 'zh', 'ph'], true)) {
                    $out .= ['sh' => 'S', 'ch' => 'C', 'kh' => 'K', 'gh' => 'G', 'zh' => 'Z', 'ph' => 'f'][$pair];
                    $i++;

                    continue;
                }

                if (in_array($pair, ['th', 'dh', 'bh', 'jh'], true)) {
                    $out .= $c;
                    $i++;

                    continue;
                }

                if (in_array($c, ['a', 'e', 'i', 'o', 'u'], true)) {
                    $out .= $atStart ? 'a' : '';

                    continue;
                }

                $out .= match ($c) {
                    'y', 'w', 'v' => $atStart ? 'a' : '',
                    'c', 'q' => 'k',
                    'x' => 'ks',
                    default => $c,
                };
            }
        }

        // Doubled letters sound once ("hassan" is "hsn").
        return preg_replace('/(.)\1+/', '$1', $out) ?? $out;
    }

    /**
     * @param  list<string>  $said
     * @param  list<string>  $of
     */
    private static function everyWordIn(array $said, array $of): bool
    {
        foreach ($said as $word) {
            $found = false;

            foreach ($of as $candidate) {
                if ($word === $candidate || (mb_strlen($word) >= 3 && str_starts_with($candidate, $word))) {
                    $found = true;
                    break;
                }
            }

            if (! $found) {
                return false;
            }
        }

        return $said !== [];
    }

    /**
     * @param  list<string>  $said
     * @param  list<string>  $of
     */
    private static function everySoundIn(array $said, array $of): bool
    {
        $sounds = array_map(fn (string $w) => self::wordSkeleton($w), $of);

        foreach ($said as $word) {
            $sound = self::wordSkeleton($word);

            if ($sound === '' || strlen($sound) < 2 || ! in_array($sound, $sounds, true)) {
                return false;
            }
        }

        return $said !== [];
    }

    /** Edit distance between two strings, counted in letters (so it works for any script). */
    private static function distance(string $a, string $b): int
    {
        $x = mb_str_split($a);
        $y = mb_str_split($b);
        $row = range(0, count($y));

        foreach ($x as $i => $cx) {
            $previous = $row[0];
            $row[0] = $i + 1;

            foreach ($y as $j => $cy) {
                $current = $row[$j + 1];
                $row[$j + 1] = min($row[$j + 1] + 1, $row[$j] + 1, $previous + ($cx === $cy ? 0 : 1));
                $previous = $current;
            }
        }

        return $row[count($y)];
    }
}
