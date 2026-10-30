<?php

namespace App\Services;

use App\Enums\InvitationState;
use App\Enums\Role;
use App\Exceptions\DoctorAlreadyHasSignIn;
use App\Exceptions\DuplicateEmail;
use App\Exceptions\Forbidden;
use App\Exceptions\InvitationUsed;
use App\Exceptions\LastAdmin;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\StaffInvitation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Who works at the clinic: inviting people (with the email), resending or revoking an invitation, and switching a
 * person off and on. The invitation itself (token, expiry, accepting) is InvitationService; this is the admin's side.
 */
class StaffService
{
    public function __construct(
        private readonly InvitationService $invitations,
        private readonly Audit $audit,
        private readonly UserSessions $sessions,
    ) {}

    /** Invite a receptionist or another clinic admin. */
    public function invite(Clinic $clinic, string $email, Role $role): Invitation
    {
        $email = strtolower(trim($email));
        $this->refuseTakenAddress($email);

        return DB::transaction(function () use ($clinic, $email, $role): Invitation {
            [$invitation, $token] = $this->invitations->issue($clinic, $email, $role);

            $this->send($clinic, $invitation, $token);
            $this->audit->record('user.invited', $invitation, ['email' => $email, 'role' => $role->value]);

            return $invitation;
        });
    }

    /** Give a doctor a login: an invitation that links the new account to this doctor when it is accepted. */
    public function inviteDoctor(Clinic $clinic, Doctor $doctor, string $email): Invitation
    {
        $email = strtolower(trim($email));

        if ($doctor->user_id !== null) {
            throw new DoctorAlreadyHasSignIn;
        }

        $this->refuseTakenAddress($email, except: $doctor);

        return DB::transaction(function () use ($clinic, $doctor, $email): Invitation {
            // One waiting invitation per doctor: a new one replaces the old, even for another address.
            Invitation::query()->where('doctor_id', $doctor->id)->whereNull('accepted_at')->whereNull('revoked_at')
                ->get()->each(fn (Invitation $old) => $this->invitations->revoke($old));

            [$invitation, $token] = $this->invitations->issue($clinic, $email, Role::Doctor, $doctor);

            $this->send($clinic, $invitation, $token);
            $this->audit->record('user.invited', $invitation, ['email' => $email, 'role' => Role::Doctor->value]);

            return $invitation;
        });
    }

    /** A fresh link and seven fresh days for an invitation nobody has accepted. */
    public function resend(Invitation $invitation): Invitation
    {
        $this->refuseAccepted($invitation);

        return DB::transaction(function () use ($invitation): Invitation {
            $token = $this->invitations->resend($invitation);

            $this->send($invitation->clinic, $invitation, $token);
            $this->audit->record('user.invitation_resent', $invitation, ['email' => $invitation->email, 'role' => $invitation->role->value]);

            return $invitation;
        });
    }

    public function revoke(Invitation $invitation): void
    {
        $this->refuseAccepted($invitation);

        DB::transaction(function () use ($invitation): void {
            $this->invitations->revoke($invitation);
            $this->audit->record('user.revoked', $invitation, ['email' => $invitation->email, 'role' => $invitation->role->value]);
        });
    }

    /**
     * Switch a person off (they are signed out at once and cannot sign in) or back on. Not yourself, and never the clinic's
     * last active admin.
     */
    public function setActive(User $target, bool $active, User $actor): User
    {
        if ($target->is_active === $active) {
            return $target;
        }

        if (! $active && $target->is($actor)) {
            throw new Forbidden('You cannot deactivate yourself.');
        }

        return DB::transaction(function () use ($target, $active): User {
            // Checked under a lock: two admins switching each other off at the same moment must not leave nobody.
            if (! $active && $target->role === Role::ClinicAdmin && ! $this->anotherActiveAdminExists($target, lock: true)) {
                throw new LastAdmin;
            }

            $target->forceFill(['is_active' => $active])->save();

            if (! $active) {
                $this->sessions->endAll($target);
            }

            $this->audit->record($active ? 'user.reactivated' : 'user.deactivated', $target, ['email' => $target->email, 'role' => $target->role?->value]);

            return $target;
        });
    }

    /** True when someone else in the clinic can still sign in as an admin. */
    public function anotherActiveAdminExists(User $except, bool $lock = false): bool
    {
        $query = User::query()->inCurrentClinic()
            ->where('role', Role::ClinicAdmin->value)->where('is_active', true)->whereKeyNot($except->id);

        return $lock ? $query->lockForUpdate()->count() > 0 : $query->exists();
    }

    /** An address that has an account anywhere, or already has a live invitation here, cannot be invited. */
    private function refuseTakenAddress(string $email, ?Doctor $except = null): void
    {
        if (User::query()->where('email', $email)->exists()) {
            throw new DuplicateEmail;
        }

        $waiting = Invitation::query()->where('email', $email)->whereNull('accepted_at')->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->when($except !== null, fn ($query) => $query->where(fn ($q) => $q->whereNull('doctor_id')->orWhere('doctor_id', '!=', $except?->id)))
            ->exists();

        if ($waiting) {
            throw new DuplicateEmail;
        }
    }

    private function refuseAccepted(Invitation $invitation): void
    {
        if ($invitation->state() === InvitationState::Used) {
            throw new InvitationUsed;
        }
    }

    private function send(Clinic $clinic, Invitation $invitation, string $token): void
    {
        Notification::route('mail', $invitation->email)->notify(new StaffInvitation($clinic->name, $invitation->role, url("/invite/{$token}")));
    }
}
