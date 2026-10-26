import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    forcedStateFromUrl,
    type ForcedState,
} from '@/components/reception/runtime';
import { startDemoActivity } from '@/lib/data';

/**
 * What every staff layout shares: the `?state=` override (local hosts only), a refresh counter
 * that makes every page reload its data, the offline banner, and the demo activity that stands in
 * for a live server. With Reverb, only the connection part changes.
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

    // The demo has no live server: messages advance and (with ?sim=1) other receptionists hold slots.
    useEffect(() => {
        if (import.meta.env.MODE === 'test') {
            return;
        }

        const sim = new URLSearchParams(window.location.search).get('sim');

        return startDemoActivity({ otherReceptionist: sim === '1' });
    }, []);

    return {
        forced,
        epoch,
        refresh,
        reconnecting: !online || forced === 'reconnecting',
    };
}
