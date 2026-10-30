<?php

namespace App\Views\Admin;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use App\Services\StaffService;
use App\Views\ClinicView;

/**
 * `AdminStaffView`: the clinic's receptionists and admins (people and waiting invitations together) with the server's
 * verdict on what each row allows. Doctors are managed on the Doctors page and are not listed.
 */
final class StaffView
{
    public function __construct(private readonly StaffService $staff) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic, User $me): array
    {
        $users = User::query()->inCurrentClinic()->whereIn('role', [Role::ClinicAdmin->value, Role::Receptionist->value])->orderBy('name')->get();
        $invitations = Invitation::query()->whereNull('accepted_at')->whereNull('revoked_at')->whereNull('doctor_id')
            ->whereIn('role', [Role::ClinicAdmin->value, Role::Receptionist->value])->orderBy('created_at')->orderBy('id')->get();

        return [
            'clinic' => ClinicView::of($clinic),
            'rows' => [
                ...$users->map(fn (User $user) => $this->person($user, $me))->all(),
                ...$invitations->map(fn (Invitation $invitation) => $this->invited($invitation))->all(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function person(User $user, User $me): array
    {
        $isYou = $user->is($me);
        $lastAdmin = $user->is_active && $user->role === Role::ClinicAdmin && ! $this->staff->anotherActiveAdminExists($user);

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role?->value,
            'status' => $user->is_active ? 'active' : 'deactivated',
            'isYou' => $isYou,
            'allowed' => ['resend' => false, 'revoke' => false, 'deactivate' => $user->is_active && ! $isYou && ! $lastAdmin, 'reactivate' => ! $user->is_active],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function invited(Invitation $invitation): array
    {
        return [
            'id' => $invitation->id,
            'name' => null,
            'email' => $invitation->email,
            'role' => $invitation->role->value,
            'status' => $invitation->expires_at->isPast() ? 'expired' : 'invited',
            'isYou' => false,
            'allowed' => ['resend' => true, 'revoke' => true, 'deactivate' => false, 'reactivate' => false],
        ];
    }
}
