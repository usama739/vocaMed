<?php

namespace App\Http\Requests\Admin;

use App\Models\Doctor;
use App\Rules\ExistsInClinic;
use Illuminate\Foundation\Http\FormRequest;

/** `POST /admin/services` and `PUT /admin/services/{id}`: name, duration, buffer and the doctors who offer it. */
class SaveServiceRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }

        $this->mergeIfMissing(['doctorIds' => []]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'durationMin' => ['required', 'integer', 'between:5,180', 'multiple_of:5'],
            'bufferMin' => ['required', 'integer', 'between:0,60', 'multiple_of:5'],
            'doctorIds' => ['array', 'max:200'],
            'doctorIds.*' => ['string', 'distinct', new ExistsInClinic(Doctor::class)],
        ];
    }
}
