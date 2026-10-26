import { createContext, useContext } from 'react';
import type { BookingPanelInitial } from '@/components/vocamed/booking-panel';
import type { Appointment } from '@/lib/data';

/** States a developer can force on any reception page with `?state=` (local hosts only). */
export type ForcedState = 'loading' | 'empty' | 'error' | 'reconnecting';

export const FORCED_STATES: readonly ForcedState[] = [
    'loading',
    'empty',
    'error',
    'reconnecting',
];

export type ReceptionRuntime = {
    /** `?state=` override, so every state can be reviewed and tested without waiting for a failure. */
    forced: ForcedState | null;
    /** Bumped when the connection returns or something was booked, so pages reload their data. */
    epoch: number;
    refresh: () => void;
    openBooking: (prefill?: BookingPanelInitial) => void;
    openVoice: () => void;
    openReschedule: (appointment: Appointment) => void;
};

const noop = () => undefined;

export const ReceptionRuntimeContext = createContext<ReceptionRuntime>({
    forced: null,
    epoch: 0,
    refresh: noop,
    openBooking: noop,
    openVoice: noop,
    openReschedule: noop,
});

export const useReception = () => useContext(ReceptionRuntimeContext);

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Local hosts only: production never honours `?state=`. */
export function forcedStateFromUrl(
    search: string,
    hostname: string,
): ForcedState | null {
    if (!DEV_HOSTS.has(hostname) && !hostname.endsWith('.test')) {
        return null;
    }

    const value = new URLSearchParams(search).get('state');

    return FORCED_STATES.find((state) => state === value) ?? null;
}
