<?php

namespace App\Enums;

/** The emails a staff member can switch on or off on the Account page. In-app alerts always show. */
enum AccountNotification: string
{
    case FailedReminders = 'failedReminders';
    case PatientCancellations = 'patientCancellations';
    case DailySummary = 'dailySummary';

    /** What a person gets until they choose otherwise. */
    public function default(): bool
    {
        return match ($this) {
            self::FailedReminders, self::PatientCancellations => true,
            self::DailySummary => false,
        };
    }
}
