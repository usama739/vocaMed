<?php

namespace App\Support;

use App\Enums\ClinicStatus;
use App\Exceptions\NoTenantContext;
use App\Models\Clinic;
use Closure;

/**
 * Which clinic the code is acting for. One per request or queued job (a scoped container binding), set by the
 * `SetTenantContext` middleware from the signed-in person, by `RunInClinic` for jobs, or by `run()` for
 * commands. Every model that carries a `clinic_id` reads and writes through it (see `BelongsToClinic`), and with no
 * clinic set those models refuse to be queried: the safe failure is an error, never someone else's rows.
 *
 * `bypass()` is the one deliberate way out, for work that happens before a clinic is known (opening an
 * invitation link, signing in). Keep its callbacks small.
 */
class TenantContext
{
    private ?Clinic $clinic = null;

    private int $bypassing = 0;

    public function set(Clinic $clinic): void
    {
        $this->clinic = $clinic;
    }

    public function forget(): void
    {
        $this->clinic = null;
    }

    public function clinic(): ?Clinic
    {
        return $this->clinic;
    }

    public function id(): ?string
    {
        return $this->clinic?->id;
    }

    /** The current clinic's id, or an error: for code that cannot make sense without one. */
    public function requireId(): string
    {
        return $this->id() ?? throw NoTenantContext::forQuery();
    }

    public function bypassed(): bool
    {
        return $this->bypassing > 0;
    }

    /**
     * Run the callback as this clinic, then put back whatever was set before (so commands and jobs can nest). A
     * bypass around the call does not leak in: inside, the clinic's rules apply.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function run(Clinic $clinic, Closure $callback): mixed
    {
        $previous = $this->clinic;
        $bypassing = $this->bypassing;
        $this->clinic = $clinic;
        $this->bypassing = 0;

        try {
            return $callback();
        } finally {
            $this->clinic = $previous;
            $this->bypassing = $bypassing;
        }
    }

    /**
     * Run the callback with no clinic filtering at all. Only for the places that act before a clinic is known.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function bypass(Closure $callback): mixed
    {
        $this->bypassing++;

        try {
            return $callback();
        } finally {
            $this->bypassing--;
        }
    }

    /**
     * Run the callback once for every active clinic, each as that clinic: how scheduled commands do per-clinic work.
     *
     * @param  Closure(Clinic): mixed  $callback
     */
    public function eachClinic(Closure $callback): void
    {
        Clinic::query()
            ->where('status', ClinicStatus::Active)
            ->orderBy('id')
            ->each(fn (Clinic $clinic) => $this->run($clinic, fn () => $callback($clinic)));
    }
}
