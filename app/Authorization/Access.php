<?php

namespace App\Authorization;

/** How far a role may use an ability: not at all, only on records that are theirs, or on every record. */
enum Access: string
{
    case None = 'none';
    case Own = 'own';
    case All = 'all';
}
