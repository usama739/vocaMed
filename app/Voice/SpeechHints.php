<?php

namespace App\Voice;

/**
 * The spelling hint sent with a recording: the clinic's doctors and services, so "Laith Garner" comes back written the way the clinic
 * writes it instead of as something that sounds like it. The provider only allows a short hint (224 tokens on Groq), so names are added
 * whole until the limit and the rest are left out.
 */
final class SpeechHints
{
    private const OPENING = 'Booking an appointment at a clinic.';

    /**
     * @param  list<string>  $doctors
     * @param  list<string>  $services
     */
    public static function prompt(array $doctors, array $services, int $maxCharacters): ?string
    {
        $prompt = self::OPENING;

        foreach (['Doctors' => $doctors, 'Services' => $services] as $label => $names) {
            $line = '';

            foreach ($names as $name) {
                $next = $line === '' ? " $label: $name" : "$line, $name";

                if (mb_strlen($prompt.$next) + 1 > $maxCharacters) {
                    break;
                }

                $line = $next;
            }

            $prompt .= $line === '' ? '' : $line.'.';
        }

        return $prompt === self::OPENING ? null : $prompt;
    }
}
