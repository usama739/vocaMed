<?php

namespace App\Support;

use Closure;

/**
 * Who is acting when nobody is signed in: for the length of a callback, the patient who opened a link. The audit writer reads it, so
 * everything the booking engine does on a patient's behalf is recorded as "the patient". One per request.
 */
final class ActingAs
{
    private bool $patient = false;

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function patient(Closure $callback): mixed
    {
        $before = $this->patient;
        $this->patient = true;

        try {
            return $callback();
        } finally {
            $this->patient = $before;
        }
    }

    public function isPatient(): bool
    {
        return $this->patient;
    }
}
