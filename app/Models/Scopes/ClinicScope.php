<?php

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Limits every query to the clinic being acted for, and refuses to run at all when there is none.
 *
 * @implements Scope<Model>
 */
class ClinicScope implements Scope
{
    /**
     * @param  Builder<covariant Model>  $builder
     */
    public function apply(Builder $builder, Model $model): void
    {
        $tenant = app(TenantContext::class);

        if ($tenant->bypassed()) {
            return;
        }

        $builder->where($model->qualifyColumn('clinic_id'), $tenant->requireId());
    }
}
