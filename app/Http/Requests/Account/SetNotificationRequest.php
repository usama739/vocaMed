<?php

namespace App\Http\Requests\Account;

use App\Enums\AccountNotification;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SetNotificationRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'key' => ['required', Rule::enum(AccountNotification::class)],
            'on' => ['required', 'boolean'],
        ];
    }
}
