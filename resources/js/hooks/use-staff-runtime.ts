import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    forcedStateFromUrl,
    type ForcedState,
} from '@/components/reception/runtime';
import { startDemoActivity } from '@/lib/data';
import { connectLive, liveConfigured, useLiveStatus } from '@/lib/live';

/**
 * What every staff layout shares: the `?state=` override (local hosts only), a refresh counter
 * that makes every page reload its data, the offline and reconnecting banner, the live line to the
 * server (Reverb) when it is configured, and otherwise the demo activity that stands in for one.
 */
export function useStaffRuntime() {
    const { url } = usePage();
    const [epoch, setEpoch] = useState(0);
    const [online, setOnline] = useState(() =>
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );

    const forced: ForcedState | null = useMemo(
        () =>
            typeof window === 'undefined'
                ? null
                : forcedStateFromUrl(
                      window.location.search,
                      window.location.hostname,
                  ),
        // The address can change with navigation (`url`), and `?state=` rides along with it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [url],
    );

    const refresh = useCallback(() => setEpoch((n) => n + 1), []);

    // Connection: show the banner while offline and reload every page's data when it returns.
    useEffect(() => {
        const down = () => setOnline(false);
        const up = () => {
            setOnline(true);
            refresh();
        };

        window.addEventListener('offline', down);
        window.addEventListener('online', up);

        return () => {
            window.removeEventListener('offline', down);
            window.removeEventListener('online', up);
        };
    }, [refresh]);

    // The real backend: keep the live line open on this person's private channel (see `lib/live`).
    const channel = usePage().props.auth?.liveChannel ?? null;
    const wantsLive = liveConfigured() && channel !== null;

    useEffect(() => {
        if (!wantsLive || channel === null) {
            return;
        }

        return connectLive(channel);
    }, [wantsLive, channel]);

    // Whatever was announced while the line was down was missed: when it comes back, every page reads again.
    const liveStatus = useLiveStatus();
    const wasDown = useRef(false);

    useEffect(() => {
        if (liveStatus === 'down') {
            wasDown.current = true;
        } else if (liveStatus === 'connected' && wasDown.current) {
            wasDown.current = false;
            refresh();
        }
    }, [liveStatus, refresh]);

    // The demo has no live server: messages advance and (with ?sim=1) other receptionists hold slots.
    useEffect(() => {
        if (import.meta.env.MODE === 'test' || wantsLive) {
            return;
        }

        const sim = new URLSearchParams(window.location.search).get('sim');

        return startDemoActivity({ otherReceptionist: sim === '1' });
    }, [wantsLive]);

    return {
        forced,
        epoch,
        refresh,
        // The banner shows when the browser is offline, or the live line was wanted and has dropped.
        reconnecting:
            !online || liveStatus === 'down' || forced === 'reconnecting',
    };
}
