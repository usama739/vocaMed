<?php

namespace App\Enums;

/** How a voice request arrived: a recording the server turns into text, or text the receptionist typed. */
enum VoiceSource: string
{
    case Audio = 'audio';
    case Text = 'text';
}
