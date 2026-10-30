<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Database\Eloquent\Model;

/**
 * An id that arrives in a request must name a record of the clinic acting. Laravel's `exists:table,id` rule queries the
 * table directly and ignores the clinic filter, so it would accept another clinic's id; this one goes through the model,
 * and so through the clinic scope.
 */
class ExistsInClinic implements ValidationRule
{
    /**
     * @param  class-string<Model>  $model
     */
    public function __construct(private readonly string $model) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '' || ! $this->model::query()->whereKey($value)->exists()) {
            $fail('The selected :attribute is invalid.');
        }
    }
}
