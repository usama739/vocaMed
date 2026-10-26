import type { AppointmentStatus } from './types';

/**
 * Where an appointment may go next. The reception screens let a receptionist jump to any
 * on-the-day stage (a patient who walks straight in is "In consultation"), so the forward
 * moves are generous; finished appointments stay finished.
 */
export const STATUS_TRANSITIONS: Record<
    AppointmentStatus,
    AppointmentStatus[]
> = {
    booked: [
        'confirmed',
        'arrived',
        'in_consultation',
        'done',
        'cancelled',
        'no_show',
    ],
    confirmed: ['arrived', 'in_consultation', 'done', 'cancelled', 'no_show'],
    arrived: ['in_consultation', 'done', 'cancelled', 'no_show'],
    in_consultation: ['arrived', 'done', 'no_show'],
    done: [],
    cancelled: [],
    no_show: [],
};

/** What "press again to undo" returns to. */
export const PREVIOUS_STATUS: Partial<
    Record<AppointmentStatus, AppointmentStatus>
> = {
    arrived: 'confirmed',
    in_consultation: 'arrived',
    done: 'in_consultation',
    no_show: 'confirmed',
};

export const canMoveStatus = (from: AppointmentStatus, to: AppointmentStatus) =>
    STATUS_TRANSITIONS[from].includes(to);

/** Statuses a receptionist can still reschedule or cancel. */
export const isOpenStatus = (status: AppointmentStatus) =>
    status === 'booked' || status === 'confirmed';
