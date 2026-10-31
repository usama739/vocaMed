<?php

namespace App\Messaging;

use App\Models\Appointment;
use App\PatientLinks\PatientLinks;
use App\Services\TemplateCatalog;
use Carbon\CarbonImmutable;

/**
 * Turns a kind of message and an appointment into text: the clinic's wording (or the built-in one) in the patient's language, with
 * their name, the doctor, the time in the clinic's own clock and a fresh private link. Only the placeholders the Templates page allows
 * are filled in; the same list is checked when the clinic saves a message.
 */
class MessageRenderer
{
    public function __construct(private readonly TemplateCatalog $templates, private readonly PatientLinks $links) {}

    /**
     * @return array{subject: string, body: string}
     */
    public function render(Appointment $appointment, string $kind, string $channel): array
    {
        $appointment->loadMissing(['patient', 'doctor', 'service']);
        $patient = $appointment->patient;
        $clinic = $appointment->clinic;
        $locale = in_array($patient->preferred_locale, (array) config('templates.locales'), true) ? $patient->preferred_locale : 'en';

        $values = [
            '{patient_name}' => $patient->name,
            '{doctor}' => $appointment->doctor->display_name,
            '{time}' => $this->time($appointment, $clinic->timezone, $locale),
            '{clinic_name}' => $clinic->name,
            '{link}' => $this->links->urlFor($this->links->issue($appointment)),
        ];

        return [
            'subject' => strtr((string) config("templates.subjects.$kind.$locale"), $values),
            'body' => strtr($this->templates->bodyFor($kind, $channel, $locale), $values),
        ];
    }

    /** The visit's time on the clinic's own clock, written in the patient's language ("Wed 4 Nov, 10:00 AM"). */
    private function time(Appointment $appointment, string $timezone, string $locale): string
    {
        $local = CarbonImmutable::instance($appointment->starts_at)->setTimezone($timezone);
        $localized = $local->locale($locale);

        return ($localized instanceof CarbonImmutable ? $localized : $local)->translatedFormat('D j M, g:i A');
    }
}
