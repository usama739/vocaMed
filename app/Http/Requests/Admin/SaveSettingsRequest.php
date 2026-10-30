<?php

namespace App\Http\Requests\Admin;

use App\Data\ClinicSettings;
use App\Http\Middleware\SetLocale;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * `PUT /admin/settings`: the clinic's details and every setting in one body (the page's draft). An error on a detail
 * names the plain field ("name", "phone"), as the page expects, not "clinic.name".
 */
class SaveSettingsRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $clinic = $this->input('clinic');

        if (is_array($clinic) && isset($clinic['name']) && is_string($clinic['name'])) {
            $clinic['name'] = trim($clinic['name']);
            $this->merge(['clinic' => $clinic]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'clinic' => ['required', 'array'],
            'clinic.name' => ['required', 'string', 'max:255'],
            'clinic.phone' => ['nullable', 'string', 'max:40'],
            'clinic.address' => ['nullable', 'string', 'max:255'],
            'clinic.timezone' => ['required', 'string', 'timezone:all'],
            'clinic.defaultLocale' => ['required', Rule::in(array_keys(SetLocale::LOCALES))],
            'settings' => ['required', 'array'],
            ...ClinicSettings::rules(),
            'settings.holidays' => ['present', 'array', 'max:200'],
            'settings.holidays.*.date' => ['required', 'date_format:Y-m-d', 'distinct'],
            'settings.holidays.*.name' => ['required', 'string', 'max:120'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach ((array) $this->input('settings.businessHours', []) as $i => $day) {
                if (is_array($day) && isset($day['open'], $day['close']) && $day['open'] >= $day['close']) {
                    $validator->errors()->add("settings.businessHours.$i.close", 'Closing time must be after opening time.');
                }
            }
        });
    }

    protected function failedValidation(Validator $validator): void
    {
        $errors = [];

        foreach ($validator->errors()->messages() as $key => $messages) {
            $errors[preg_replace('/^clinic\./', '', $key) ?? $key] = $messages;
        }

        throw ValidationException::withMessages($errors);
    }
}
