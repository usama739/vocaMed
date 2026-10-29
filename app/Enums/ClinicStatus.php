<?php

namespace App\Enums;

enum ClinicStatus: string
{
    case Active = 'active';

    /** Nobody from the clinic can sign in; nothing is deleted. */
    case Suspended = 'suspended';
}
