<?php

namespace App\Services;

use App\Data\ClinicSettings;
use App\Exceptions\InvalidPhone;
use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Support\PhoneNumber;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/** Saves the Settings page: the clinic's details, hours, holidays, reminders and voice, in one transaction. */
class ClinicSettingsService
{
    public function __construct(private readonly Audit $audit, private readonly TenantContext $tenant) {}

    /**
     * @param  array<string, mixed>  $details  name, phone, address, timezone, defaultLocale
     * @param  list<array{date: string, name: string}>  $holidays
     */
    public function save(Clinic $clinic, array $details, ClinicSettings $settings, array $holidays): void
    {
        $phone = $this->phone($clinic, (string) ($details['phone'] ?? ''));

        $this->tenant->run($clinic, fn () => DB::transaction(function () use ($clinic, $details, $settings, $holidays, $phone): void {
            $before = $this->snapshot($clinic);

            $clinic->forceFill([
                'name' => trim((string) $details['name']),
                'phone' => $phone,
                'address' => ($details['address'] ?? '') === '' ? null : trim((string) $details['address']),
                'timezone' => $details['timezone'],
                'default_locale' => $details['defaultLocale'],
                'settings' => $settings->toArray(),
            ])->save();

            $this->replaceHolidays($holidays);

            foreach ($this->changedSections($before, $this->snapshot($clinic->refresh())) as $section) {
                $this->audit->record('settings.updated', $clinic, ['section' => $section]);
            }
        }));
    }

    private function phone(Clinic $clinic, string $raw): ?string
    {
        if (trim($raw) === '') {
            return null;
        }

        return PhoneNumber::normalize($raw, $clinic->callingCode()) ?? throw new InvalidPhone;
    }

    /**
     * @param  list<array{date: string, name: string}>  $holidays
     */
    private function replaceHolidays(array $holidays): void
    {
        ClinicHoliday::query()->delete();

        foreach ($holidays as $holiday) {
            $row = new ClinicHoliday;
            $row->forceFill(['date' => $holiday['date'], 'name' => trim($holiday['name'])])->save();
        }
    }

    /**
     * What the page groups together, for the audit entries ("details", "hours", "holidays", "reminders", "voice").
     *
     * @return array<string, list<mixed>>
     */
    private function snapshot(Clinic $clinic): array
    {
        $s = $clinic->settingsData();

        return [
            'details' => [$clinic->name, $clinic->phone, $clinic->address, $clinic->timezone, $clinic->default_locale],
            'hours' => [$s->businessHours],
            'holidays' => [$clinic->holidays()->get()->map(fn (ClinicHoliday $h) => [$h->date->format('Y-m-d'), $h->name])->all()],
            'reminders' => [$s->reminderHoursBefore, $s->cancellationWindowHours, $s->rescheduleRequiresApproval],
            'voice' => [$s->voiceEnabled, $s->voiceAudioRetentionDays],
        ];
    }

    /**
     * @param  array<string, list<mixed>>  $before
     * @param  array<string, list<mixed>>  $after
     * @return list<string>
     */
    private function changedSections(array $before, array $after): array
    {
        return array_keys(array_filter($after, fn (array $value, string $section) => $value !== $before[$section], ARRAY_FILTER_USE_BOTH));
    }
}
