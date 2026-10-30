<?php

namespace App\Data;

use Illuminate\Validation\Rule;

/**
 * A clinic's settings as stored in `clinics.settings` (JSON), with a default for anything not yet set. Read and
 * written only through this class, so the JSON can never hold a value the Settings page would not offer.
 *
 * Holidays live in their own table and the clinic's details in columns; this is the rest.
 */
final class ClinicSettings
{
    /**
     * @param  list<array{weekday: int, open: string, close: string}>  $businessHours  a day that is missing is closed
     * @param  list<int>  $reminderHoursBefore  longest first
     */
    public function __construct(
        public readonly array $businessHours,
        public readonly array $reminderHoursBefore,
        public readonly ?int $cancellationWindowHours,
        public readonly bool $rescheduleRequiresApproval,
        public readonly bool $voiceEnabled,
        public readonly int $voiceAudioRetentionDays,
    ) {}

    /** What a new clinic starts with: open Monday to Saturday 09:00 to 17:00, voice off until it is set up. */
    public static function defaults(): self
    {
        return new self(
            businessHours: array_map(
                fn (int $weekday) => ['weekday' => $weekday, 'open' => '09:00', 'close' => '17:00'],
                [1, 2, 3, 4, 5, 6],
            ),
            reminderHoursBefore: [24, 2],
            cancellationWindowHours: 4,
            rescheduleRequiresApproval: false,
            voiceEnabled: false,
            voiceAudioRetentionDays: 0,
        );
    }

    /**
     * @param  array<string, mixed>|null  $stored
     */
    public static function fromArray(?array $stored): self
    {
        $d = self::defaults();
        $stored ??= [];

        return new self(
            businessHours: $stored['businessHours'] ?? $d->businessHours,
            reminderHoursBefore: $stored['reminderHoursBefore'] ?? $d->reminderHoursBefore,
            cancellationWindowHours: array_key_exists('cancellationWindowHours', $stored) ? $stored['cancellationWindowHours'] : $d->cancellationWindowHours,
            rescheduleRequiresApproval: $stored['rescheduleRequiresApproval'] ?? $d->rescheduleRequiresApproval,
            voiceEnabled: $stored['voiceEnabled'] ?? $d->voiceEnabled,
            voiceAudioRetentionDays: $stored['voiceAudioRetentionDays'] ?? $d->voiceAudioRetentionDays,
        );
    }

    /**
     * The values as the page sends them (the draft's `settings`, validated with `rules()`).
     *
     * @param  array<string, mixed>  $input
     */
    public static function fromValidated(array $input): self
    {
        $hours = array_map(
            fn (array $day) => ['weekday' => (int) $day['weekday'], 'open' => (string) $day['open'], 'close' => (string) $day['close']],
            $input['businessHours'],
        );
        usort($hours, fn (array $a, array $b) => $a['weekday'] <=> $b['weekday']);

        $reminders = array_map('intval', $input['reminderHoursBefore']);
        rsort($reminders);

        return new self(
            businessHours: $hours,
            reminderHoursBefore: $reminders,
            cancellationWindowHours: $input['cancellationWindowHours'] === null ? null : (int) $input['cancellationWindowHours'],
            rescheduleRequiresApproval: (bool) $input['rescheduleRequiresApproval'],
            voiceEnabled: (bool) $input['voiceEnabled'],
            voiceAudioRetentionDays: (int) $input['voiceAudioRetentionDays'],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'businessHours' => $this->businessHours,
            'reminderHoursBefore' => $this->reminderHoursBefore,
            'cancellationWindowHours' => $this->cancellationWindowHours,
            'rescheduleRequiresApproval' => $this->rescheduleRequiresApproval,
            'voiceEnabled' => $this->voiceEnabled,
            'voiceAudioRetentionDays' => $this->voiceAudioRetentionDays,
        ];
    }

    /**
     * Validation for the draft's `settings` object, under the given key prefix.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function rules(string $prefix = 'settings'): array
    {
        $time = '/^(([01]\d|2[0-3]):(00|30)|24:00)$/';

        return [
            "$prefix.businessHours" => ['present', 'array', 'max:7'],
            "$prefix.businessHours.*.weekday" => ['required', 'integer', 'between:0,6', 'distinct'],
            "$prefix.businessHours.*.open" => ['required', 'string', "regex:$time"],
            "$prefix.businessHours.*.close" => ['required', 'string', "regex:$time"],
            "$prefix.reminderHoursBefore" => ['present', 'array', 'max:6'],
            "$prefix.reminderHoursBefore.*" => ['required', 'integer', 'distinct', Rule::in(config('vocamed.reminder_hours_options'))],
            "$prefix.cancellationWindowHours" => ['present', 'nullable', 'integer', Rule::in(config('vocamed.cancellation_window_options'))],
            "$prefix.rescheduleRequiresApproval" => ['required', 'boolean'],
            "$prefix.voiceEnabled" => ['required', 'boolean'],
            "$prefix.voiceAudioRetentionDays" => ['required', 'integer', Rule::in(config('vocamed.voice_retention_options'))],
        ];
    }
}
