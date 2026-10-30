<?php

namespace App\Views\Admin;

use App\Models\Clinic;
use App\Models\ClinicHoliday;
use App\Views\ClinicView;

/** `AdminSettingsView`: what the Settings page draws. */
final class SettingsView
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Clinic $clinic): array
    {
        return [
            'clinic' => ClinicView::of($clinic),
            'settings' => [
                'clinicId' => $clinic->id,
                ...$clinic->settingsData()->toArray(),
                'holidays' => $clinic->holidays()->get()
                    ->map(fn (ClinicHoliday $holiday) => ['date' => $holiday->date->format('Y-m-d'), 'name' => $holiday->name])
                    ->all(),
            ],
        ];
    }
}
