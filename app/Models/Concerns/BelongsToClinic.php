<?php

namespace App\Models\Concerns;

use App\Exceptions\NoTenantContext;
use App\Models\Clinic;
use App\Models\Scopes\ClinicScope;
use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * For every model whose table has a `clinic_id`. Queries are limited to the clinic being acted for (and fail when
 * there is none), new rows take that clinic, and a row can never be written for, or moved to, another clinic.
 * A test fails the build if a model with a `clinic_id` column does not use this.
 *
 * @mixin Model
 */
trait BelongsToClinic
{
    public static function bootBelongsToClinic(): void
    {
        static::addGlobalScope(new ClinicScope);

        static::creating(function (Model $model): void {
            $tenant = app(TenantContext::class);

            if ($model->getAttribute('clinic_id') === null) {
                $model->setAttribute('clinic_id', $tenant->id() ?? throw NoTenantContext::forCreate($model));

                return;
            }

            if (! $tenant->bypassed() && $tenant->id() !== null && $model->getAttribute('clinic_id') !== $tenant->id()) {
                throw NoTenantContext::crossClinicWrite($model);
            }
        });

        static::updating(function (Model $model): void {
            if ($model->isDirty('clinic_id') && $model->getOriginal('clinic_id') !== null) {
                throw NoTenantContext::crossClinicWrite($model);
            }
        });
    }

    /**
     * @return BelongsTo<Clinic, $this>
     */
    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }
}
