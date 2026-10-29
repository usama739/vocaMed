<?php

namespace App\Jobs\Middleware;

use App\Models\Clinic;
use App\Support\TenantContext;
use Closure;

/**
 * Job middleware: runs the job as the clinic named by its public `clinicId`, so its queries are limited to that
 * clinic like a request's are. Add it to a job with `public function middleware(): array { return [new RunInClinic]; }`.
 * A job without a `clinicId` fails instead of running with no clinic.
 */
class RunInClinic
{
    public function __construct(private readonly ?TenantContext $tenant = null) {}

    public function handle(object $job, Closure $next): mixed
    {
        $clinicId = $job->clinicId ?? null;

        if (! is_string($clinicId) || $clinicId === '') {
            throw new \LogicException(class_basename($job).' must carry a clinicId to run in a clinic.');
        }

        $clinic = Clinic::query()->findOrFail($clinicId);

        return ($this->tenant ?? app(TenantContext::class))->run($clinic, fn () => $next($job));
    }
}
