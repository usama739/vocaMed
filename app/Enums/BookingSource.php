<?php

namespace App\Enums;

/** How an appointment came to be. */
enum BookingSource: string
{
    /** A receptionist typed it in. */
    case Manual = 'manual';

    /** The patient is already at the desk: starts as arrived, never refused for a busy or past slot. */
    case WalkIn = 'walk_in';

    /** Spoken, reviewed by a receptionist, then booked (M10). */
    case Voice = 'voice';

    /** The patient moved or booked it from their own link (M6). */
    case PatientLink = 'patient_link';
}
