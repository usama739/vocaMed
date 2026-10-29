<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class DemoRequestRequest extends FormRequest
{
    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'clinic' => ['required', 'string', 'max:255'],
            'contact' => ['required', 'string', 'max:255'],
        ];
    }
}
