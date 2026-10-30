<?php

namespace App\Views;

use App\Models\Clinic;

/** The clinic as the screens receive it (`Clinic` in lib/data/types.ts). */
final class ClinicView
{
    /**
     * @return array{id: string, name: string, country: string, phoneCountryCode: string, timezone: string, defaultLocale: string, address: string, phone: string}
     */
    public static function of(Clinic $clinic): array
    {
        return [
            'id' => $clinic->id,
            'name' => $clinic->name,
            'country' => $clinic->country,
            'phoneCountryCode' => $clinic->callingCode(),
            'timezone' => $clinic->timezone,
            'defaultLocale' => $clinic->default_locale,
            'address' => $clinic->address ?? '',
            'phone' => $clinic->phone ?? '',
        ];
    }
}
