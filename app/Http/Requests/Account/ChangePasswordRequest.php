<?php

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/** The page sends `confirm` for the repeated new password; a mismatch is reported on that field. */
class ChangePasswordRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'current' => ['required', 'string'],
            'password' => ['required', 'string', Password::defaults()],
            'confirm' => ['required', 'string', 'same:password'],
        ];
    }
}
