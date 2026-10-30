<?php

namespace App\Views\Admin;

use App\Booking\UpcomingCounts;
use App\Data\AvailabilityDraft;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Invitation;
use App\Models\Service;
use App\Services\AvailabilityService;
use App\Support\ClinicClock;
use App\Views\ClinicView;
use App\Views\ServiceView;

/**
 * `AdminDoctorView`: one doctor (or the blank form for a new one) with every service to tick, the sign-in access and the
 * availability draft with its preview.
 */
final class DoctorProfileView
{
    public function __construct(private readonly AvailabilityService $availability, private readonly UpcomingCounts $upcoming) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, ?Doctor $doctor): array
    {
        $services = Service::query()->orderBy('name')->get();
        $draft = $doctor === null ? AvailabilityDraft::blank() : $this->availability->draftOf($doctor);

        return [
            'clinic' => ClinicView::of($clinic),
            'today' => ClinicClock::for($clinic)->today(),
            'id' => $doctor?->id,
            'profile' => $doctor === null
                ? ['name' => '', 'specialty' => '', 'languages' => ['en', 'ur'], 'serviceIds' => $services->where('is_active', true)->pluck('id')->values()->all(), 'active' => true]
                : ['name' => $doctor->display_name, 'specialty' => $doctor->specialty, 'languages' => $doctor->languages, 'serviceIds' => $doctor->services()->pluck('services.id')->sort()->values()->all(), 'active' => $doctor->is_active],
            'services' => $services->map(fn (Service $s) => ServiceView::of($s))->all(),
            'upcoming' => $doctor === null ? 0 : $this->upcoming->forDoctors([$doctor->id])[$doctor->id] ?? 0,
            'signIn' => $this->signIn($doctor),
            'draft' => $draft,
            'preview' => $this->availability->preview($clinic, $draft, $doctor),
        ];
    }

    /**
     * Who can sign in as this doctor: nobody yet, someone invited (or whose invitation ran out), or the person who accepted.
     *
     * @return array{state: string, email: string|null, invitationId: string|null}
     */
    private function signIn(?Doctor $doctor): array
    {
        if ($doctor === null) {
            return ['state' => 'none', 'email' => null, 'invitationId' => null];
        }

        if ($doctor->user !== null) {
            return ['state' => 'active', 'email' => $doctor->user->email, 'invitationId' => null];
        }

        $waiting = Invitation::query()->where('doctor_id', $doctor->id)->whereNull('accepted_at')->whereNull('revoked_at')->latest('created_at')->first();

        if ($waiting === null) {
            return ['state' => 'none', 'email' => null, 'invitationId' => null];
        }

        return ['state' => $waiting->expires_at->isPast() ? 'expired' : 'invited', 'email' => $waiting->email, 'invitationId' => $waiting->id];
    }
}
