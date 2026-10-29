<?php

namespace App\Exceptions;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Code touched clinic data with no clinic set, or tried to write another clinic's data. A programming error, so
 * it is loud: never rendered as an answer a page understands.
 */
class NoTenantContext extends LogicException
{
    public static function forQuery(): self
    {
        return new self('No clinic is set: query a clinic table only inside a request, job or TenantContext::run().');
    }

    public static function forCreate(Model $model): self
    {
        return new self('Cannot create '.class_basename($model).' with no clinic: set clinic_id or run inside a clinic.');
    }

    public static function crossClinicWrite(Model $model): self
    {
        return new self('Refused: '.class_basename($model).' belongs to another clinic than the one acting.');
    }
}
