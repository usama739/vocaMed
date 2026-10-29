<?php

namespace App\Enums;

/**
 * What a signed-in person may do in their clinic. One user has exactly one role in exactly one
 * clinic; the permissions behind each role live in policies and gates, not here.
 */
enum Role: string
{
    case ClinicAdmin = 'clinic_admin';
    case Receptionist = 'receptionist';
    case Doctor = 'doctor';

    /** Where this role lands after signing in: the first page of its own area. */
    public function home(): string
    {
        return match ($this) {
            self::ClinicAdmin => '/admin',
            self::Receptionist => '/reception',
            self::Doctor => '/doctor',
        };
    }
}
