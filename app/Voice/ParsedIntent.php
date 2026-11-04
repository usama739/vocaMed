<?php

namespace App\Voice;

/**
 * What a person asked for, as the words they used: the output of an intent parser and the input of the resolver. Only booking is
 * understood by voice; any other request (cancel, move, look up) is `unsupported` and the screen says to use the screens.
 *
 * `date` is a clinic-local `YYYY-MM-DD` and `time` an `HH:MM`, both null when not said. Everything else is the heard text, untouched.
 */
final class ParsedIntent
{
    public const BOOK = 'book';

    public const UNSUPPORTED = 'unsupported';

    public function __construct(
        public readonly string $kind,
        public readonly ?string $patientName = null,
        public readonly ?string $patientPhone = null,
        public readonly ?string $doctorName = null,
        public readonly ?string $serviceName = null,
        public readonly ?string $date = null,
        public readonly ?string $time = null,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $text = fn (string $key): ?string => isset($data[$key]) && is_string($data[$key]) && trim($data[$key]) !== '' ? trim($data[$key]) : null;

        return new self(
            kind: ($data['kind'] ?? null) === self::UNSUPPORTED ? self::UNSUPPORTED : self::BOOK,
            patientName: $text('patientName'),
            patientPhone: $text('patientPhone'),
            doctorName: $text('doctorName'),
            serviceName: $text('serviceName'),
            date: $text('date'),
            time: $text('time'),
        );
    }

    /**
     * @return array{kind: string, patientName: string|null, patientPhone: string|null, doctorName: string|null, serviceName: string|null, date: string|null, time: string|null}
     */
    public function toArray(): array
    {
        return [
            'kind' => $this->kind,
            'patientName' => $this->patientName,
            'patientPhone' => $this->patientPhone,
            'doctorName' => $this->doctorName,
            'serviceName' => $this->serviceName,
            'date' => $this->date,
            'time' => $this->time,
        ];
    }
}
