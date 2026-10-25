// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { navItems, ROLE_HOME } from './nav-config';

// The lists below are copied from the spec's "Roles and navigation" table.
describe('role-scoped navigation', () => {
    it('Clinic Admin sees exactly the seven admin items', () => {
        expect(navItems('clinic_admin').map((i) => i.href)).toEqual([
            '/admin',
            '/admin/doctors',
            '/admin/staff',
            '/admin/services',
            '/admin/settings',
            '/admin/templates',
            '/admin/audit',
        ]);
    });

    it('Receptionist sees exactly Today, Appointments, Calendar, Patients, Notifications', () => {
        expect(navItems('receptionist').map((i) => i.label)).toEqual([
            'nav.today',
            'nav.appointments',
            'nav.calendar',
            'nav.patients',
            'nav.notifications',
        ]);
    });

    it('Doctor sees Overview, My schedule, Availability, Requests', () => {
        expect(navItems('doctor').map((i) => i.label)).toEqual([
            'nav.overview',
            'nav.schedule',
            'nav.availability',
            'nav.requests',
        ]);
    });

    it('keeps each role inside its own route prefix', () => {
        expect(
            navItems('clinic_admin').every((i) => i.href.startsWith('/admin')),
        ).toBe(true);
        expect(
            navItems('receptionist').every((i) =>
                i.href.startsWith('/reception'),
            ),
        ).toBe(true);
        expect(
            navItems('doctor').every((i) => i.href.startsWith('/doctor')),
        ).toBe(true);
    });

    it('lands each role on its home route', () => {
        expect(ROLE_HOME).toEqual({
            clinic_admin: '/admin',
            receptionist: '/reception',
            doctor: '/doctor',
        });
    });
});
