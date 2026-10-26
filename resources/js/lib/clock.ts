/**
 * The app's clock. It is the real clock, except on a local host opened with `?now=<ISO time>`:
 * then time starts at that instant and keeps running, so a demo, a screenshot or a browser test
 * can always start on, say, "Monday 10:15" whatever day it really is. Production ignores it.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function offsetFromUrl(): number {
    if (typeof window === 'undefined') {
        return 0;
    }

    const { hostname, search } = window.location;

    if (!LOCAL_HOSTS.has(hostname) && !hostname.endsWith('.test')) {
        return 0;
    }

    const requested = new URLSearchParams(search).get('now');
    const at = requested ? Date.parse(requested) : Number.NaN;

    return Number.isNaN(at) ? 0 : at - Date.now();
}

// Read once, when the first page loads: later in-app navigation keeps the same clock.
const offsetMs = offsetFromUrl();

export const clockMs = (): number => Date.now() + offsetMs;

export const clockNow = (): Date => new Date(clockMs());
