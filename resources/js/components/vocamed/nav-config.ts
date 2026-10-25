import {
    Bell,
    Calendar,
    CalendarDays,
    ClipboardList,
    Clock,
    Inbox,
    LayoutGrid,
    List,
    MessageSquare,
    ShieldCheck,
    SlidersHorizontal,
    UserPlus,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/data';

export type NavLabelKey =
    | 'nav.overview'
    | 'nav.doctors'
    | 'nav.staff'
    | 'nav.services'
    | 'nav.settings'
    | 'nav.templates'
    | 'nav.audit'
    | 'nav.today'
    | 'nav.appointments'
    | 'nav.calendar'
    | 'nav.patients'
    | 'nav.notifications'
    | 'nav.schedule'
    | 'nav.availability'
    | 'nav.requests';

export type NavSectionKey =
    'nav.sections.clinic' | 'nav.sections.setup' | 'nav.sections.records';

export type NavEntry =
    | { type: 'section'; label: NavSectionKey }
    | {
          type: 'item';
          key: string;
          label: NavLabelKey;
          href: string;
          icon: LucideIcon;
      };

const item = (
    key: string,
    label: NavLabelKey,
    href: string,
    icon: LucideIcon,
): NavEntry => ({ type: 'item', key, label, href, icon });

const section = (label: NavSectionKey): NavEntry => ({
    type: 'section',
    label,
});

/**
 * Role-scoped navigation. The lists and routes come straight from the frontend spec
 * ("Roles and navigation"). The server enforces the same rules; hiding an item is not security.
 */
export const NAV: Record<Role, NavEntry[]> = {
    clinic_admin: [
        section('nav.sections.clinic'),
        item('overview', 'nav.overview', '/admin', LayoutGrid),
        section('nav.sections.setup'),
        item('doctors', 'nav.doctors', '/admin/doctors', UserPlus),
        item('staff', 'nav.staff', '/admin/staff', Users),
        item('services', 'nav.services', '/admin/services', ClipboardList),
        item('settings', 'nav.settings', '/admin/settings', SlidersHorizontal),
        item('templates', 'nav.templates', '/admin/templates', MessageSquare),
        section('nav.sections.records'),
        item('audit', 'nav.audit', '/admin/audit', ShieldCheck),
    ],
    receptionist: [
        item('today', 'nav.today', '/reception', CalendarDays),
        item(
            'appointments',
            'nav.appointments',
            '/reception/appointments',
            List,
        ),
        item('calendar', 'nav.calendar', '/reception/calendar', Calendar),
        item('patients', 'nav.patients', '/reception/patients', Users),
        item(
            'notifications',
            'nav.notifications',
            '/reception/notifications',
            Bell,
        ),
    ],
    doctor: [
        item('overview', 'nav.overview', '/doctor', LayoutGrid),
        item('schedule', 'nav.schedule', '/doctor/schedule', Calendar),
        item('availability', 'nav.availability', '/doctor/availability', Clock),
        item('requests', 'nav.requests', '/doctor/requests', Inbox),
    ],
};

export const ROLE_HOME: Record<Role, string> = {
    clinic_admin: '/admin',
    receptionist: '/reception',
    doctor: '/doctor',
};

export const RECEPTION_CONSOLE_HREF = '/reception';

export function navItems(role: Role) {
    return NAV[role].filter(
        (entry): entry is Extract<NavEntry, { type: 'item' }> =>
            entry.type === 'item',
    );
}
