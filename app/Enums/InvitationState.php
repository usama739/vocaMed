<?php

namespace App\Enums;

enum InvitationState: string
{
    case Valid = 'valid';

    /** Past its seven days, revoked, or never existed: all three look the same from outside. */
    case Expired = 'expired';

    case Used = 'used';
}
