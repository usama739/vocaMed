<?php

namespace App\Authorization;

use App\Enums\Role;

/**
 * Everything a staff member can be allowed to do: one case per row of the backend specification's permission table.
 * The table itself is `access()`; gates, policies and the tests all read it, so there is one place to change a rule.
 *
 * Hiding a menu item is not access control: every route and action checks the ability on the server.
 */
enum Ability: string
{
    /** Manage staff and invitations. */
    case ManageStaff = 'staff.manage';

    /** Manage doctors, services, clinic settings and message templates. */
    case ManageClinicSetup = 'clinic.manage';

    case ViewAuditLog = 'audit.view';

    /** Create, reschedule and cancel appointments. */
    case BookAppointments = 'appointments.book';

    /** View appointments and the calendar. */
    case ViewAppointments = 'appointments.view';

    /** Create and edit patients. */
    case ManagePatients = 'patients.manage';

    /** Mark Arrived and No-show. */
    case MarkArrival = 'appointments.arrival';

    /** Mark In consultation and Done. */
    case MarkConsultation = 'appointments.consultation';

    /** Edit availability and time off. */
    case EditAvailability = 'availability.edit';

    /** Approve or reject reschedule requests (phase 2). */
    case DecideRequests = 'requests.decide';

    public function access(Role $role): Access
    {
        return match ($this) {
            self::ManageStaff,
            self::ManageClinicSetup,
            self::ViewAuditLog => match ($role) {
                Role::ClinicAdmin => Access::All,
                Role::Receptionist, Role::Doctor => Access::None,
            },

            self::BookAppointments,
            self::ManagePatients,
            self::MarkArrival => match ($role) {
                Role::ClinicAdmin, Role::Receptionist => Access::All,
                Role::Doctor => Access::None,
            },

            self::ViewAppointments,
            self::MarkConsultation => match ($role) {
                Role::ClinicAdmin, Role::Receptionist => Access::All,
                Role::Doctor => Access::Own,
            },

            self::EditAvailability,
            self::DecideRequests => match ($role) {
                Role::ClinicAdmin => Access::All,
                Role::Receptionist => Access::None,
                Role::Doctor => Access::Own,
            },
        };
    }
}
