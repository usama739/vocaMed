<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\ValidationException;

/**
 * For a request whose body nests what one form edits (`profile.name`, `availability.days.3.end`): the error names the
 * field the form shows ("name", "days"), not the path, because the screens map errors by that name.
 */
trait NamesTheFieldPlainly
{
    protected function failedValidation(Validator $validator): void
    {
        $errors = [];

        foreach ($validator->errors()->messages() as $key => $messages) {
            $field = $this->plainField($key);
            $errors[$field] = [...($errors[$field] ?? []), ...$messages];
        }

        throw ValidationException::withMessages($errors);
    }

    protected function plainField(string $key): string
    {
        $key = preg_replace('/^(profile|availability)\./', '', $key) ?? $key;

        return explode('.', $key)[0];
    }
}
