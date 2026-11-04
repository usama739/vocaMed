<?php

namespace App\Voice\Parsing;

/**
 * The words of one request, each as typed or said (`raw`) and folded for comparison (`n`), with a mark for the ones a rule has already
 * taken so no word is used for two things.
 */
final class Tokens
{
    /** @var list<string> */
    public array $raw = [];

    /** @var list<string> */
    public array $n = [];

    /** @var list<bool> */
    public array $used = [];

    public function add(string $raw, string $folded): void
    {
        $this->raw[] = $raw;
        $this->n[] = $folded;
        $this->used[] = false;
    }

    public function count(): int
    {
        return count($this->n);
    }

    /** There is a word here and nothing has taken it. */
    public function free(int $i): bool
    {
        return $i >= 0 && $i < count($this->n) && ! $this->used[$i];
    }

    /**
     * The word here is free and is one of these.
     *
     * @param  list<string>  $words
     */
    public function is(int $i, array $words): bool
    {
        return $this->free($i) && in_array($this->n[$i], $words, true);
    }

    public function take(int ...$indexes): void
    {
        foreach ($indexes as $i) {
            if ($i >= 0 && $i < count($this->used)) {
                $this->used[$i] = true;
            }
        }
    }

    public function has(string $word): bool
    {
        return in_array($word, $this->n, true);
    }
}
