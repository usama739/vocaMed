<?php

namespace App\Services;

use App\Enums\InvitationState;
use App\Enums\Role;
use App\Exceptions\DuplicateEmail;
use App\Exceptions\InvitationExpired;
use App\Exceptions\InvitationUsed;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Invitation;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

class InvitationService
{
    public function __construct(private readonly TenantContext $tenant) {}

    /**
     * Invite someone to a clinic's staff. Returns the invitation and the plain token for the link:
     * the token is shown once, and only its hash is stored. Inviting the same address again replaces
     * any invitation still waiting for it, so only the newest link works.
     *
     * @return array{0: Invitation, 1: string}
     */
    public function issue(Clinic $clinic, string $email, Role $role, ?Doctor $doctor = null): array
    {
        $email = strtolower(trim($email));

        if (User::query()->where('email', $email)->exists()) {
            throw new DuplicateEmail;
        }

        return $this->tenant->run($clinic, fn (): array => DB::transaction(function () use ($clinic, $email, $role, $doctor): array {
            Invitation::query()
                ->where('email', $email)
                ->whereNull('accepted_at')
                ->delete();

            $token = bin2hex(random_bytes(32));

            $invitation = new Invitation;
            $invitation->forceFill([
                'clinic_id' => $clinic->id,
                'email' => $email,
                'role' => $role,
                'doctor_id' => $doctor?->id,
                'token_hash' => Invitation::hashToken($token),
                'expires_at' => now()->addDays((int) config('vocamed.invitation_days')),
            ])->save();

            return [$invitation, $token];
        }));
    }

    /**
     * The invitation a link's token opens, if any. The link is opened before anyone is signed in, so there is no
     * clinic yet: the token itself (unguessable, stored hashed) is what finds the invitation.
     */
    public function find(string $token): ?Invitation
    {
        return $this->tenant->bypass(fn (): ?Invitation => Invitation::query()
            ->with('clinic')
            ->where('token_hash', Invitation::hashToken($token))
            ->first());
    }

    /**
     * Give a waiting or expired invitation a fresh link and a fresh seven days; the old link stops working. Returns the
     * new plain token (shown once, in the email).
     */
    public function resend(Invitation $invitation): string
    {
        $token = bin2hex(random_bytes(32));

        $invitation->forceFill([
            'token_hash' => Invitation::hashToken($token),
            'expires_at' => now()->addDays((int) config('vocamed.invitation_days')),
            'revoked_at' => null,
        ])->save();

        return $token;
    }

    /** Cancel an invitation that has not been accepted. Its link reads as expired from now on. */
    public function revoke(Invitation $invitation): void
    {
        $invitation->forceFill(['revoked_at' => now()])->save();
    }

    /** An unknown token reads as expired, so a link's history is never revealed. */
    public function stateOf(?Invitation $invitation): InvitationState
    {
        return $invitation?->state() ?? InvitationState::Expired;
    }

    /**
     * Turn an invitation into a staff account. The address is trusted (the link was sent to it), so
     * the account is verified; it can sign in straight away.
     */
    public function accept(string $token, string $name, string $password): User
    {
        return $this->tenant->bypass(fn (): User => DB::transaction(function () use ($token, $name, $password): User {
            $invitation = Invitation::query()
                ->with('clinic')
                ->where('token_hash', Invitation::hashToken($token))
                ->lockForUpdate()
                ->first();

            match ($this->stateOf($invitation)) {
                InvitationState::Expired => throw new InvitationExpired,
                InvitationState::Used => throw new InvitationUsed,
                InvitationState::Valid => null,
            };

            /** @var Invitation $invitation */
            $doctor = null;

            if ($invitation->doctor_id !== null) {
                // A doctor's invitation links the new login to that doctor; a doctor already linked cannot be linked twice.
                $doctor = Doctor::query()->lockForUpdate()->find($invitation->doctor_id);

                if ($doctor === null || $doctor->user_id !== null) {
                    throw new InvitationUsed;
                }
            }

            if (User::query()->where('email', $invitation->email)->exists()) {
                throw new InvitationUsed;
            }

            $user = new User([
                'name' => trim($name),
                'email' => $invitation->email,
                'password' => $password,
                'locale' => $invitation->clinic->default_locale,
            ]);
            $user->forceFill([
                'clinic_id' => $invitation->clinic_id,
                'role' => $invitation->role,
                'is_active' => true,
                'email_verified_at' => now(),
            ])->save();

            $doctor?->forceFill(['user_id' => $user->id])->save();
            $invitation->forceFill(['accepted_at' => now()])->save();

            return $user;
        }));
    }
}
