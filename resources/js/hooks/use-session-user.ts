import { useEffect, useSyncExternalStore } from 'react';
import {
    getSessionUser,
    subscribeSessionUser,
    type Role,
    type SessionUser,
} from '@/lib/data';

const AREA_KEY = 'vocamed.area';
const ROLES: Role[] = ['clinic_admin', 'receptionist', 'doctor'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isRole = (value: string | null): value is Role =>
    !!value && (ROLES as string[]).includes(value);

const remembered = (): Role | null => {
    try {
        const stored = window.sessionStorage.getItem(AREA_KEY);

        return isRole(stored) ? stored : null;
    } catch {
        return null;
    }
};

/** The staff area the demo was last in, so "Account" opens for the person who clicked it. */
function rememberArea(role: Role) {
    try {
        window.sessionStorage.setItem(AREA_KEY, role);
    } catch {
        // No storage (a private window): the account page falls back to the clinic admin.
    }
}

/**
 * Which role the page is for. The real backend knows it from the session. The demo has none, so it
 * is the area last visited, with `?role=` on local hosts to review each one, else the clinic admin.
 */
export function useSessionRole(): Role {
    if (typeof window === 'undefined') {
        return 'clinic_admin';
    }

    const { hostname, search } = window.location;
    const requested = new URLSearchParams(search).get('role');

    if (LOCAL_HOSTS.has(hostname) || hostname.endsWith('.test')) {
        if (isRole(requested)) {
            return requested;
        }
    }

    return remembered() ?? 'clinic_admin';
}

/**
 * The signed-in person, for the top bar and the Account page. This hook is the seam for the backend:
 * with Laravel it returns the `auth.user` prop every page already receives. A staff layout passes its
 * own role, which also teaches the demo which area the person is working in.
 */
export function useSessionUser(role?: Role): SessionUser {
    const fallback = useSessionRole();
    const area = role ?? fallback;

    useEffect(() => {
        if (role) {
            rememberArea(role);
        }
    }, [role]);

    return useSyncExternalStore(
        subscribeSessionUser,
        () => getSessionUser(area),
        () => getSessionUser(area),
    );
}
