<?php

namespace App\PatientLinks;

use App\Models\Appointment;
use App\Models\Clinic;
use App\Models\PatientLink;
use App\Support\ActingAs;
use App\Support\TenantContext;
use Carbon\CarbonImmutable;
use Closure;

/**
 * Private links to one appointment. The token is 64 random hex characters shown once and stored only as a hash, so a stolen
 * database cannot open anyone's link. A link is opened before anyone is known, so the token itself finds it; everything after
 * that runs inside that clinic, acting as the patient.
 */
class PatientLinks
{
    /** A link works this long after the visit ends. */
    public const GRACE_HOURS = 24;

    public function __construct(private readonly TenantContext $tenant, private readonly ActingAs $acting) {}

    /** A new link for the appointment. Returns the token (the only time it exists in the clear). */
    public function issue(Appointment $appointment): string
    {
        $token = bin2hex(random_bytes(32));

        (new PatientLink)->forceFill([
            'clinic_id' => $appointment->clinic_id,
            'appointment_id' => $appointment->id,
            'token_hash' => PatientLink::hashToken($token),
        ])->save();

        return $token;
    }

    public function urlFor(string $token): string
    {
        return url('/p/'.$token);
    }

    /** Stop every link to the appointment from working. */
    public function revokeAll(Appointment $appointment): void
    {
        PatientLink::query()->where('appointment_id', $appointment->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
    }

    /** What the token opens, or null when it opens nothing (so a guessed link says nothing about any clinic). */
    public function open(string $token): ?ResolvedLink
    {
        if ($token === '' || strlen($token) > 200) {
            return null;
        }

        return $this->tenant->bypass(function () use ($token): ?ResolvedLink {
            $link = PatientLink::query()->where('token_hash', PatientLink::hashToken($token))->first();
            $appointment = $link === null ? null : Appointment::query()->with(['doctor', 'service', 'patient'])->find($link->appointment_id);
            $clinic = $appointment === null ? null : Clinic::query()->find($appointment->clinic_id);

            if ($link === null || $appointment === null || $clinic === null) {
                return null;
            }

            $usable = $link->revoked_at === null
                && CarbonImmutable::now()->lessThanOrEqualTo($appointment->ends_at->toImmutable()->addHours(self::GRACE_HOURS));

            return new ResolvedLink($link, $appointment, $clinic, $appointment->doctor, $appointment->service, $appointment->patient, $clinic->settingsData(), $usable);
        });
    }

    /**
     * Run something for an opened link: inside its clinic, as the patient.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function within(ResolvedLink $link, Closure $callback): mixed
    {
        return $this->tenant->run($link->clinic, fn () => $this->acting->patient($callback));
    }
}
