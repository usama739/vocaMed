<?php

namespace App\Http\Requests\Voice;

use App\Authorization\Ability;
use App\Authorization\Permissions;
use App\Exceptions\VoiceOff;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Both ways of asking for a booking by voice share one door: the person must be allowed to use voice, and the clinic must have it
 * switched on. This runs before the input is checked, so a clinic with voice off always hears `VOICE_OFF`, whatever was sent.
 */
abstract class VoiceFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if (! $user instanceof User || ! Permissions::allows($user, Ability::UseVoice)) {
            return false;
        }

        if (! $user->clinic?->settingsData()->voiceEnabled) {
            throw new VoiceOff;
        }

        return true;
    }
}
