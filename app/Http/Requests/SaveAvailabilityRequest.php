<?php

namespace App\Http\Requests;

use App\Data\AvailabilityDraft;
use App\Http\Requests\Concerns\NamesTheFieldPlainly;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/** An availability draft on its own: saving it, or previewing it. The doctor's page and the admin's send the same body. */
class SaveAvailabilityRequest extends FormRequest
{
    use NamesTheFieldPlainly;

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return AvailabilityDraft::rules();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => AvailabilityDraft::checkOrder($validator, $this->all()));
    }
}
