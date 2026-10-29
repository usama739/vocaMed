<?php

namespace App\Http\Requests\Auth;

use App\Data\NewClinic;
use Illuminate\Foundation\Http\FormRequest;

class SignUpRequest extends FormRequest
{
    /**
     * Addresses are stored lowercase, so the "already taken" check must compare the same way. The language
     * is the one the person is reading the page in.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => strtolower(trim((string) $this->input('email'))),
            'locale' => app()->getLocale(),
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return NewClinic::rules();
    }
}
