<?php

namespace App\Voice\Parsing;

use App\Voice\Contracts\IntentParser;
use App\Voice\IntentFailed;
use App\Voice\ParseContext;
use App\Voice\ParsedIntent;
use App\Voice\Text\Folding;
use App\Voice\Text\NameMatcher;
use Carbon\CarbonImmutable;

/**
 * Reads a booking request with plain rules: no model, no network, the same answer every time, and no patient text leaves the server.
 * It understands English, Roman Urdu and Urdu script, alone or mixed in one sentence ("Ayesha ka appointment Dr Sana ke saath kal teen baje").
 *
 * It takes what it can recognise out of the sentence, one kind of thing at a time (phone number, day, time of day, service, doctor), and
 * what is left is the patient's name. It reports the words as heard; turning them into this clinic's patient, doctor and service is the
 * resolver's job. Everything it knows how to say lives in `Lexicon`.
 */
class RulesIntentParser implements IntentParser
{
    /** How alike a spoken group of words and a clinic's doctor or service name must be to count as that name. */
    private const VOCABULARY_MATCH = 0.85;

    public function parse(string $text, ParseContext $context): ParsedIntent
    {
        [$text, $phone] = $this->takePhone(trim($text));
        $tokens = $this->tokenize($text);

        if ($this->isNotABooking($tokens)) {
            return new ParsedIntent(ParsedIntent::UNSUPPORTED);
        }

        $date = $this->takeDate($tokens, $context->now->setTimezone($context->timezone));
        $time = $this->takeTime($tokens);
        $service = $this->takeVocabulary($tokens, $context->serviceNames, titleCase: false);
        $doctor = $this->takeDoctor($tokens, $context->doctorNames);
        $patient = $this->patientName($tokens);

        $found = [$phone, $date, $time, $service, $doctor, $patient];
        $bookish = array_intersect($tokens->n, Lexicon::BOOK) !== [];

        if (! $bookish && array_filter($found, fn (?string $v) => $v !== null) === []) {
            throw new IntentFailed('unreadable');
        }

        return new ParsedIntent(ParsedIntent::BOOK, $patient, $phone, $doctor, $service, $date, $time);
    }

    // ---- phone ----

    /**
     * A phone number is ten or more digits (or a plus and nine), with spaces or dashes between groups. It goes first so its digits are never
     * mistaken for a time or a date.
     *
     * @return array{0: string, 1: string|null}
     */
    private function takePhone(string $text): array
    {
        $found = null;

        $rest = preg_replace_callback('/(?<![\d])(\+?\d[\d\s\-]{7,}\d)(?![\d])/u', function (array $m) use (&$found): string {
            $digits = strlen(preg_replace('/\D/', '', $m[1]) ?? '');

            if ($found !== null || ($digits < 10 && ! (str_starts_with($m[1], '+') && $digits >= 9))) {
                return $m[0];
            }

            $found = trim($m[1]);

            return ' ';
        }, Folding::digits($text));

        return [$rest ?? $text, $found];
    }

    // ---- words ----

    private function tokenize(string $text): Tokens
    {
        $tokens = new Tokens;

        foreach (preg_split('/[\s,;،!?"()\[\]]+/u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
            $folded = str_replace("'", '', Folding::fold($word));
            $folded = trim($folded, '.:-/');
            $raw = trim($word, '.:-/,');

            if ($folded === '') {
                continue;
            }

            // "3pm" is "3" and "pm"; "15th" is "15" and "th".
            $pieces = preg_split('/(?<=\d)(?=\p{L})|(?<=\p{L})(?=\d)/u', $folded) ?: [$folded];

            foreach ($pieces as $piece) {
                $tokens->add(count($pieces) > 1 ? $piece : $raw, $piece);
            }
        }

        return $tokens;
    }

    private function isNotABooking(Tokens $t): bool
    {
        foreach ($t->n as $i => $word) {
            if (in_array($word, Lexicon::UNSUPPORTED, true)) {
                return true;
            }

            foreach (Lexicon::UNSUPPORTED_PHRASES as [$first, $second]) {
                if ($word === $first && ($t->n[$i + 1] ?? null) === $second) {
                    return true;
                }
            }
        }

        return false;
    }

    // ---- day ----

    /** The clinic-local day asked for as `YYYY-MM-DD`, or null when none was said. */
    private function takeDate(Tokens $t, CarbonImmutable $now): ?string
    {
        $today = $now->startOfDay();

        for ($i = 0; $i < $t->count(); $i++) {
            if (! $t->free($i)) {
                continue;
            }

            $n = $t->n[$i];

            if ($n === 'day' && $t->is($i + 1, ['after']) && $t->is($i + 2, ['tomorrow', 'tomorow', 'tmrw'])) {
                $t->take($i, $i + 1, $i + 2);

                return $today->addDays(2)->format('Y-m-d');
            }

            $relative = match (true) {
                in_array($n, Lexicon::TODAY, true) => 0,
                in_array($n, Lexicon::TOMORROW, true) => 1,
                in_array($n, Lexicon::DAY_AFTER, true) => 2,
                default => null,
            };

            if ($relative !== null) {
                $t->take($i);

                return $today->addDays($relative)->format('Y-m-d');
            }

            if (isset(Lexicon::WEEKDAYS[$n])) {
                $t->take($i);

                if ($t->is($i - 1, ['next', 'this', 'on', 'agle', 'agla', 'agli', 'is', 'اگلے', 'اگلا', 'اگلی', 'اس'])) {
                    $t->take($i - 1);
                }

                // The next such day after today; "Monday" said on a Monday is a week away.
                $ahead = (Lexicon::WEEKDAYS[$n] - $today->dayOfWeek + 7) % 7;

                return $today->addDays($ahead === 0 ? 7 : $ahead)->format('Y-m-d');
            }

            if ($date = $this->numericDate($t, $i, $today)) {
                return $date;
            }
        }

        return null;
    }

    private function numericDate(Tokens $t, int $i, CarbonImmutable $today): ?string
    {
        $n = $t->n[$i];

        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $n, $m) === 1) {
            return $this->validDate((int) $m[1], (int) $m[2], (int) $m[3], $t, [$i]);
        }

        if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/', $n, $m) === 1) {
            [$day, $month] = (int) $m[2] > 12 && (int) $m[1] <= 12 ? [(int) $m[2], (int) $m[1]] : [(int) $m[1], (int) $m[2]];
            $year = isset($m[3]) ? ((int) $m[3] < 100 ? 2000 + (int) $m[3] : (int) $m[3]) : null;

            return $this->monthDay($month, $day, $year, $today, $t, [$i]);
        }

        // "15 November", "15th of November".
        if (preg_match('/^\d{1,2}$/', $n) === 1) {
            $at = $i + 1;
            $take = [$i];

            if ($t->is($at, Lexicon::ORDINALS)) {
                $take[] = $at++;
            }

            if ($t->is($at, ['of'])) {
                $take[] = $at++;
            }

            if ($t->free($at) && isset(Lexicon::MONTHS[$t->n[$at]])) {
                $take[] = $at;

                return $this->monthDay(Lexicon::MONTHS[$t->n[$at]], (int) $n, null, $today, $t, $take);
            }

            // "the 15th" on its own: the next 15th.
            if (count($take) > 1 && $t->is($i + 1, Lexicon::ORDINALS)) {
                $day = (int) $n;
                $candidate = $this->dayOfMonth($day, $today);

                if ($candidate !== null) {
                    $t->take(...$take);

                    return $candidate;
                }
            }

            return null;
        }

        // "November 15", "November 15th".
        if (isset(Lexicon::MONTHS[$n]) && $t->free($i + 1) && preg_match('/^\d{1,2}$/', $t->n[$i + 1]) === 1) {
            $take = [$i, $i + 1];

            if ($t->is($i + 2, Lexicon::ORDINALS)) {
                $take[] = $i + 2;
            }

            return $this->monthDay(Lexicon::MONTHS[$n], (int) $t->n[$i + 1], null, $today, $t, $take);
        }

        return null;
    }

    /**
     * @param  list<int>  $take
     */
    private function validDate(int $year, int $month, int $day, Tokens $t, array $take): ?string
    {
        if (! checkdate($month, $day, $year)) {
            return null;
        }

        $t->take(...$take);

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /**
     * A day and month with no year is the next time that day comes round.
     *
     * @param  list<int>  $take
     */
    private function monthDay(int $month, int $day, ?int $year, CarbonImmutable $today, Tokens $t, array $take): ?string
    {
        if ($year !== null) {
            return $this->validDate($year, $month, $day, $t, $take);
        }

        $this_year = $today->year;
        $date = checkdate($month, $day, $this_year) ? CarbonImmutable::create($this_year, $month, $day, 0, 0, 0, $today->timezone) : null;

        if ($date === null || $date->lessThan($today)) {
            return $this->validDate($this_year + 1, $month, $day, $t, $take);
        }

        return $this->validDate($this_year, $month, $day, $t, $take);
    }

    /** The next date with this day of the month, this month if it has not passed. */
    private function dayOfMonth(int $day, CarbonImmutable $today): ?string
    {
        foreach ([0, 1, 2] as $ahead) {
            $month = $today->startOfMonth()->addMonthsNoOverflow($ahead);

            if (checkdate($month->month, $day, $month->year) && ! $month->setDay($day)->lessThan($today)) {
                return $month->setDay($day)->format('Y-m-d');
            }
        }

        return null;
    }

    // ---- time of day ----

    /** The time of day asked for as `HH:MM`, or null when none was said. */
    private function takeTime(Tokens $t): ?string
    {
        for ($i = 0; $i < $t->count(); $i++) {
            if (! $t->free($i)) {
                continue;
            }

            $found = $this->spokenTime($t, $i) ?? $this->plainTime($t, $i);

            if ($found === null) {
                continue;
            }

            [$hour, $minute, $take, $anchor, $first, $twentyFour] = $found;
            $period = null;
            $end = $anchor;

            // "baje" or "o'clock" after the hour, then "am", "pm" or a part of the day ("shaam", "subah").
            if ($t->is($end + 1, Lexicon::O_CLOCK)) {
                $take[] = ++$end;
            }

            if ($t->free($end + 1) && isset(Lexicon::PERIODS[$t->n[$end + 1]])) {
                $period = Lexicon::PERIODS[$t->n[$end + 1]];
                $take[] = ++$end;
            }

            // "shaam ko 5 baje", "at 5".
            $before = $first - 1;

            if ($t->is($before, ['ko', 'کو', 'mein', 'میں', 'at', '@'])) {
                $take[] = $before;
                $before--;
            }

            if ($period === null && $t->free($before) && isset(Lexicon::PERIODS[$t->n[$before]]) && ! in_array($t->n[$before], ['am', 'pm', 'a.m', 'p.m'], true)) {
                $period = Lexicon::PERIODS[$t->n[$before]];
                $take[] = $before;
            }

            $t->take(...$take);

            return sprintf('%02d:%02d', $this->hour24($hour, $period, $twentyFour), $minute);
        }

        return null;
    }

    /**
     * Times with their own word: "half past three", "saray teen" (3:30), "dhai baje" (2:30), "sawa char" (4:15), "paune paanch" (4:45).
     *
     * @return array{0: int, 1: int, 2: list<int>, 3: int, 4: int, 5: bool}|null hour, minute, words taken, last word, first word, whether the hour is 24-hour
     */
    private function spokenTime(Tokens $t, int $i): ?array
    {
        $n = $t->n[$i];

        if ($n === 'dhai' || $n === 'ڈھائی') {
            return [2, 30, [$i], $i, $i, false];
        }

        if (in_array($n, ['derh', 'dera', 'ڈیڑھ'], true)) {
            return [1, 30, [$i], $i, $i, false];
        }

        $afterWord = null;
        $minute = null;

        if ($n === 'half' && $t->is($i + 1, ['past'])) {
            [$afterWord, $minute] = [$i + 2, 30];
        } elseif ($n === 'quarter' && $t->is($i + 1, ['past'])) {
            [$afterWord, $minute] = [$i + 2, 15];
        } elseif ($n === 'quarter' && $t->is($i + 1, ['to'])) {
            [$afterWord, $minute] = [$i + 2, 45];
        } elseif (in_array($n, ['saray', 'saare', 'sarhe', 'saadhe', 'saade', 'sadhe', 'saarhe', 'ساڑھے'], true)) {
            [$afterWord, $minute] = [$i + 1, 30];
        } elseif (in_array($n, ['sawa', 'سوا'], true)) {
            [$afterWord, $minute] = [$i + 1, 15];
        } elseif (in_array($n, ['paune', 'پونے'], true)) {
            [$afterWord, $minute] = [$i + 1, 45];
        }

        if ($afterWord === null || ($hour = $this->hourWord($t, $afterWord)) === null) {
            return null;
        }

        // "quarter to four" and "paune char" are a quarter before the hour.
        $isBefore = ($n === 'quarter' && $t->n[$i + 1] === 'to') || in_array($n, ['paune', 'پونے'], true);
        $take = range($i, $afterWord);

        return [$isBefore ? ($hour[0] === 1 ? 12 : $hour[0] - 1) : $hour[0], $minute, $take, $afterWord, $i, false];
    }

    /**
     * A number that is an hour because of what is around it: "at 10", "10:30", "3 baje", "ten am", "teen baje".
     *
     * @return array{0: int, 1: int, 2: list<int>, 3: int, 4: int, 5: bool}|null
     */
    private function plainTime(Tokens $t, int $i): ?array
    {
        $hour = $this->hourWord($t, $i);

        if ($hour === null) {
            return null;
        }

        [$h, $m, $hasMinutes, $isWord, $literal] = $hour;
        $clockWordAfter = $t->is($i + 1, Lexicon::O_CLOCK) || $t->is($i + 1, ['am', 'pm', 'a.m', 'p.m']);
        $atBefore = $t->is($i - 1, ['at', '@']);
        $partOfDayBefore = $t->free($i - 1) && isset(Lexicon::PERIODS[$t->n[$i - 1]]) && ! in_array($t->n[$i - 1], ['am', 'pm', 'a.m', 'p.m'], true);

        // A bare "3" or "ten" with nothing around it is not a time ("Ahmed 3 tomorrow").
        if (! ($hasMinutes || $clockWordAfter || $atBefore || $partOfDayBefore)) {
            return null;
        }

        $take = [$i];
        $anchor = $i;

        // "ten thirty", "three fifteen", "four forty five".
        if (! $hasMinutes) {
            $minuteWords = ['thirty' => 30, 'fifteen' => 15, 'fortyfive' => 45, 'forty-five' => 45];

            if ($t->free($i + 1) && isset($minuteWords[$t->n[$i + 1]])) {
                $m = $minuteWords[$t->n[$i + 1]];
                $take[] = ++$anchor;
            } elseif ($t->is($i + 1, ['forty']) && $t->is($i + 2, ['five'])) {
                $m = 45;
                $take[] = ++$anchor;
                $take[] = ++$anchor;
            }
        }

        // "15:00" and "09:30" are 24-hour clock times; "3" and "3:30" are told apart by the clinic's day (see hour24).
        $twentyFour = ! $isWord && ($h >= 13 || $h === 0 || (strlen($literal) >= 2 && $literal[0] === '0'));

        return [$h, $m, $take, $anchor, $i, $twentyFour];
    }

    /**
     * An hour as a digit ("3", "10:30", "15.00") or a word ("three", "teen").
     *
     * @return array{0: int, 1: int, 2: bool, 3: bool, 4: string}|null hour, minute, whether minutes were given, whether it was a word, as written
     */
    private function hourWord(Tokens $t, int $i): ?array
    {
        if (! $t->free($i)) {
            return null;
        }

        $n = $t->n[$i];

        if (preg_match('/^(\d{1,2})(?:[:.](\d{2}))?$/', $n, $m) === 1) {
            $hour = (int) $m[1];
            $minute = isset($m[2]) ? (int) $m[2] : 0;

            return $hour > 23 || $minute > 59 ? null : [$hour, $minute, isset($m[2]), false, $n];
        }

        return isset(Lexicon::NUMBERS[$n]) ? [Lexicon::NUMBERS[$n], 0, false, true, $n] : null;
    }

    /**
     * What clock hour is meant. With no part of the day said, a clinic's day decides: 1 to 6 is the afternoon, 7 to 11 the morning, 12 noon.
     */
    private function hour24(int $hour, ?string $period, bool $twentyFour): int
    {
        if ($twentyFour) {
            return $hour;
        }

        return match ($period) {
            'am' => $hour === 12 ? 0 : $hour,
            'pm' => $hour < 12 ? $hour + 12 : $hour,
            'noon' => $hour === 12 ? 12 : ($hour <= 6 ? $hour + 12 : $hour),
            'night' => $hour === 12 ? 0 : ($hour >= 6 ? $hour + 12 : $hour),
            default => $hour >= 1 && $hour <= 6 ? $hour + 12 : $hour,
        };
    }

    // ---- doctor, service, patient ----

    /**
     * The name of a doctor: the words after "Dr" (or "doctor", "daktar", "ڈاکٹر"), else a name from the clinic's own list said without a
     * title, else the words after "with" or before "ke saath".
     *
     * @param  list<string>  $doctorNames
     */
    private function takeDoctor(Tokens $t, array $doctorNames): ?string
    {
        for ($i = 0; $i < $t->count(); $i++) {
            if (! $t->is($i, Lexicon::DOCTOR)) {
                continue;
            }

            $run = $this->fitToKnownNames($t, $this->nameRun($t, $i + 1, 3), $doctorNames);

            if ($run !== []) {
                $t->take($i, ...$run);

                return $this->say($t, $run);
            }
        }

        if (($known = $this->takeVocabulary($t, $doctorNames)) !== null) {
            return $known;
        }

        for ($i = 0; $i < $t->count(); $i++) {
            if ($t->is($i, ['with'])) {
                $run = $this->nameRun($t, $i + 1, 2);

                if ($run !== []) {
                    $t->take($i, ...$run);

                    return $this->say($t, $run);
                }
            }

            // "Sana ke saath", "ثناء کے ساتھ".
            if ($t->is($i, ['ke', 'کے']) && $t->is($i + 1, ['saath', 'sath', 'ساتھ'])) {
                $run = $this->nameRunBefore($t, $i - 1, 2);

                if ($run !== []) {
                    $t->take($i, $i + 1, ...$run);

                    return $this->say($t, $run);
                }
            }
        }

        return null;
    }

    /**
     * A name from the clinic's own list (a doctor or a service) said anywhere in the request: the group of up to three words that is most
     * like one of them.
     *
     * @param  list<string>  $names
     */
    private function takeVocabulary(Tokens $t, array $names, bool $titleCase = true): ?string
    {
        $best = null;

        foreach ($names as $name) {
            for ($length = 3; $length >= 1; $length--) {
                for ($i = 0; $i + $length <= $t->count(); $i++) {
                    $span = range($i, $i + $length - 1);

                    if (array_filter($span, fn (int $j) => ! $t->free($j)) !== []) {
                        continue;
                    }

                    $heard = implode(' ', array_map(fn (int $j) => $t->raw[$j], $span));
                    $score = NameMatcher::score($heard, $name);

                    if ($score >= self::VOCABULARY_MATCH && ($best === null || $score > $best[0] || ($score === $best[0] && $length < count($best[1])))) {
                        $best = [$score, $span];
                    }
                }
            }
        }

        if ($best === null) {
            return null;
        }

        $t->take(...$best[1]);

        return $this->say($t, $best[1], $titleCase);
    }

    /**
     * Free name words from `$start` on, at most `$max`, stopping at the first word that is not part of a name.
     *
     * @return list<int>
     */
    private function nameRun(Tokens $t, int $start, int $max): array
    {
        $run = [];

        for ($i = $start; $i < $t->count() && count($run) < $max; $i++) {
            if (! $this->isNameWord($t, $i)) {
                break;
            }

            $run[] = $i;
        }

        return $run;
    }

    /**
     * A title is followed by the doctor's name and then, often, the patient's ("Dr Sana Bilal Ahmed"). When the clinic's doctors are
     * known, the doctor is as many of those words as best match one of them; when none matches well the whole run is kept.
     *
     * @param  list<int>  $run
     * @param  list<string>  $names
     * @return list<int>
     */
    private function fitToKnownNames(Tokens $t, array $run, array $names): array
    {
        $best = null;

        foreach ($names as $name) {
            for ($length = 1; $length <= count($run); $length++) {
                $heard = implode(' ', array_map(fn (int $j) => $t->raw[$j], array_slice($run, 0, $length)));
                $score = NameMatcher::score($heard, $name);

                if ($score >= self::VOCABULARY_MATCH && ($best === null || $score > $best[0])) {
                    $best = [$score, $length];
                }
            }
        }

        return $best === null ? $run : array_slice($run, 0, $best[1]);
    }

    /**
     * Free name words going back from `$start`, at most `$max`, returned in reading order.
     *
     * @return list<int>
     */
    private function nameRunBefore(Tokens $t, int $start, int $max): array
    {
        $run = [];

        for ($i = $start; $i >= 0 && count($run) < $max; $i--) {
            if (! $this->isNameWord($t, $i)) {
                break;
            }

            array_unshift($run, $i);
        }

        return $run;
    }

    private function isNameWord(Tokens $t, int $i): bool
    {
        if (! $t->free($i)) {
            return false;
        }

        $n = $t->n[$i];

        return preg_match('/^\p{L}{2,}$/u', $n) === 1
            && ! in_array($n, Lexicon::STOP, true)
            && ! in_array($n, Lexicon::DOCTOR, true)
            && ! in_array($n, Lexicon::O_CLOCK, true)
            && ! isset(Lexicon::NUMBERS[$n])
            && ! isset(Lexicon::PERIODS[$n])
            && ! isset(Lexicon::WEEKDAYS[$n])
            && ! isset(Lexicon::MONTHS[$n]);
    }

    /** What is left once everything else is taken out: the longest run of name words (at most four), in the order said. */
    private function patientName(Tokens $t): ?string
    {
        $best = [];
        $run = [];

        for ($i = 0; $i <= $t->count(); $i++) {
            if ($i < $t->count() && $this->isNameWord($t, $i)) {
                $run[] = $i;

                continue;
            }

            if (count($run) > count($best)) {
                $best = $run;
            }

            $run = [];
        }

        if ($best === []) {
            return null;
        }

        $best = array_slice($best, 0, 4);
        $t->take(...$best);

        return $this->say($t, $best);
    }

    /**
     * The words as said. A name typed all in lower case is given capitals; one with capitals already is left alone.
     *
     * @param  list<int>  $indexes
     */
    private function say(Tokens $t, array $indexes, bool $titleCase = true): string
    {
        $name = implode(' ', array_map(fn (int $i) => $t->raw[$i], $indexes));

        return $titleCase && $name === mb_strtolower($name) ? mb_convert_case($name, MB_CASE_TITLE) : $name;
    }
}
