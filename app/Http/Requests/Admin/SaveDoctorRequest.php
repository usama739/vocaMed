<?php

namespace App\Http\Requests\Admin;

use App\Data\AvailabilityDraft;
use App\Http\Requests\Concerns\NamesTheFieldPlainly;
use App\Models\Service;
use App\Rules\ExistsInClinic;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `POST /admin/doctors` and `PUT /admin/doctors/{id}`: profile, services and weekly availability in one body. */
class SaveDoctorRequest extends FormRequest
{
    use NamesTheFieldPlainly;

    protected function prepareForValidation(): void
    {
        $profile = $this->input('profile');

        if (is_array($profile) && isset($profile['name']) && is_string($profile['name'])) {
            $profile['name'] = trim($profile['name']);
            $this->merge(['profile' => $profile]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'profile' => ['required', 'array'],
            'profile.name' => ['required', 'string', 'max:120'],
            'profile.specialty' => ['nullable', 'string', 'max:120'],
            'profile.languages' => ['present', 'array', 'max:4'],
            'profile.languages.*' => ['string', 'distinct', Rule::in(['en', 'ur', 'pa', 'ps'])],
            'profile.serviceIds' => ['present', 'array', 'max:200'],
            'profile.serviceIds.*' => ['string', 'distinct', new ExistsInClinic(Service::class)],
            'profile.active' => ['required', 'boolean'],
            'availability' => ['required', 'array'],
            ...AvailabilityDraft::rules('availability'),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => AvailabilityDraft::checkOrder($validator, (array) $this->input('availability', []), 'availability'));
    }
}
