<?php

namespace App\Http\Requests\Admin;

use App\Enums\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * `POST /admin/staff/invite` (email and role) and `POST /admin/doctors/{id}/invite` (email only; the role is the doctor's).
 * The email is lowercased and trimmed, so an address is one address whatever the letter case.
 */
class InviteRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => strtolower(trim($this->input('email')))]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $rules = ['email' => ['required', 'string', 'email', 'max:255']];

        if ($this->routeIs('admin.staff.invite')) {
            $rules['role'] = ['required', Rule::in([Role::Receptionist->value, Role::ClinicAdmin->value])];
        }

        return $rules;
    }
}
