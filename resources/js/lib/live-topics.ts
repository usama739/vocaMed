import type { ViewSource } from '@/lib/data';
import type { LiveTopic } from '@/lib/live';

/**
 * Which announcements make each page read its data again. A page that does not refresh on a timer today (its
 * `refreshMs` is 0 because it edits its own copy: settings, templates, one doctor) does not refresh live either,
 * whatever is listed here, so a form is never rewritten under the person typing in it.
 *
 * `debounceMs` waits for a burst of changes to settle before one reload; the heavy pages wait longer.
 */
export type LiveRule = { topics: readonly LiveTopic[]; debounceMs?: number };

export const VIEW_LIVE: Partial<Record<keyof ViewSource, LiveRule>> = {
    // Reception
    today: { topics: ['appointments', 'messages', 'directory'] },
    appointments: { topics: ['appointments', 'directory'] },
    appointment: { topics: ['appointments', 'messages', 'directory'] },
    calendar: { topics: ['appointments', 'directory'] },
    patients: { topics: ['directory', 'appointments'] },
    patient: { topics: ['directory', 'appointments'] },
    notifications: { topics: ['messages'] },
    // Doctor
    doctorShell: { topics: ['requests', 'appointments'] },
    doctorOverview: { topics: ['appointments', 'requests', 'directory'] },
    doctorSchedule: { topics: ['appointments', 'directory'] },
    requests: { topics: ['requests'] },
    availability: { topics: ['directory'] },
    // Clinic admin
    adminOverview: {
        topics: ['appointments', 'messages', 'directory'],
        debounceMs: 2000,
    },
    adminDoctors: { topics: ['directory', 'appointments'] },
    adminDoctor: { topics: ['directory'] },
    adminStaff: { topics: ['directory'] },
    adminServices: { topics: ['directory'] },
    adminSettings: { topics: ['directory'] },
    adminTemplates: { topics: ['directory'] },
    adminAudit: { topics: ['audit'], debounceMs: 2000 },
};

/** What the booking panel's slot lists hear: holds, bookings, and changes to hours or services. */
export const SLOT_TOPICS: readonly LiveTopic[] = [
    'slots',
    'appointments',
    'directory',
];
