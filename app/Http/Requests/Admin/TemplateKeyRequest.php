<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\NamesTheFieldPlainly;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Names one message by kind, channel and language (`PUT` and `DELETE /admin/templates`, and the test send). The text
 * itself is checked by the template catalogue, which knows the placeholders.
 */
class TemplateKeyRequest extends FormRequest
{
    use NamesTheFieldPlainly;

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $rules = [
            'kind' => ['required', Rule::in((array) config('templates.kinds'))],
            'channel' => ['required', Rule::in((array) config('templates.channels'))],
            'locale' => ['required', Rule::in((array) config('templates.locales'))],
        ];

        if ($this->isMethod('PUT') || $this->routeIs('admin.templates.test')) {
            $rules['body'] = ['required', 'string'];
        }

        if ($this->routeIs('admin.templates.test')) {
            $rules['phone'] = ['required', 'string', 'max:40'];
        }

        return $rules;
    }
}
