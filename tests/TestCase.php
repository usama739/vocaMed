<?php

namespace Tests;

use App\Support\TenantContext;
use Closure;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Fortify\Features;

abstract class TestCase extends BaseTestCase
{
    /**
     * Read clinic data in a test with no clinic filtering, the way a test checks what the app wrote for anyone.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    protected function withoutTenant(Closure $callback): mixed
    {
        return app(TenantContext::class)->bypass($callback);
    }

    protected function skipUnlessFortifyHas(string $feature, ?string $message = null): void
    {
        if (! Features::enabled($feature)) {
            $this->markTestSkipped($message ?? "Fortify feature [{$feature}] is not enabled.");
        }
    }
}
