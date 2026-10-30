<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /api/patients` (every field the screen has) and `PATCH /api/patients/{id}` (only the fields sent). The phone number
 * is checked by the patient directory, which knows the clinic's country and answers `INVALID_PHONE`.
 */
class SavePatientRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $sometimes = $creating ? [] : ['sometimes'];

        return [
            'name' => [...$sometimes, 'required', 'string', 'max:120'],
            'phone' => $creating ? ['nullable', 'string', 'max:40'] : ['sometimes', 'nullable', 'string', 'max:40'],
            'noPhone' => ['sometimes', 'boolean'],
            'preferredLocale' => ['sometimes', Rule::in(['en', 'ur'])],
            'preferredChannel' => ['sometimes', Rule::in(['sms', 'whatsapp'])],
            'consent' => ['sometimes', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }
}
