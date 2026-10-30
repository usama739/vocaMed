<?php

namespace App\Policies;

use App\Authorization\Ability;
use App\Authorization\Permissions;
use App\Enums\AppointmentStatus;
use App\Enums\Role;
use App\Models\Appointment;
use App\Models\User;

/**
 * Who may do what to an appointment, from the permission table. Reception and the admin book, move, cancel and take an
 * appointment through its whole day. A doctor sees their own appointments and may only start or finish their own consultations
 * (arrived or in consultation, to in consultation or done).
 */
class AppointmentPolicy
{
    public function view(User $user, Appointment $appointment): bool
    {
        return Permissions::allows($user, Ability::ViewAppointments, $appointment);
    }

    public function create(User $user): bool
    {
        return Permissions::allows($user, Ability::BookAppointments);
    }

    public function reschedule(User $user, Appointment $appointment): bool
    {
        return Permissions::allows($user, Ability::BookAppointments, $appointment);
    }

    public function cancel(User $user, Appointment $appointment): bool
    {
        return Permissions::allows($user, Ability::BookAppointments, $appointment);
    }

    /** Undoing a stage is for the people who run the front desk. */
    public function undo(User $user, Appointment $appointment): bool
    {
        return Permissions::allows($user, Ability::BookAppointments, $appointment);
    }

    public function changeStatus(User $user, Appointment $appointment, AppointmentStatus $to): bool
    {
        return match ($to) {
            AppointmentStatus::Cancelled => $this->cancel($user, $appointment),
            AppointmentStatus::InConsultation, AppointmentStatus::Done => Permissions::allows($user, Ability::MarkConsultation, $appointment)
                && $this->doctorMayMove($user, $appointment),
            default => Permissions::allows($user, Ability::MarkArrival, $appointment),
        };
    }

    /** A doctor only starts or finishes consultations of people who have arrived; reception and the admin have no such limit. */
    private function doctorMayMove(User $user, Appointment $appointment): bool
    {
        if (! $user->hasRole(Role::Doctor)) {
            return true;
        }

        return in_array($appointment->status, [AppointmentStatus::Arrived, AppointmentStatus::InConsultation], true);
    }
}
