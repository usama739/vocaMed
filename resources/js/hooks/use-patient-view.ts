import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forcedStateFromUrl } from '@/components/reception/runtime';
import { usePatientLinks } from '@/hooks/use-patient-links';
import type { PatientViewSource } from '@/lib/data';

export type PatientViewStatus = 'loading' | 'ready' | 'error';

/**
 * Loads one patient page read model. This hook is the seam for the backend: with Inertia it reads
 * the page props, and the queue page's refresh becomes a partial reload. Pages do not change.
 *
 * `refreshMs` keeps a live page fresh (the queue); a refresh that fails keeps what is on screen and
 * sets `stale`, so the page can say "Updates paused". It also refreshes when the tab comes back.
 * `?state=loading|error|reconnecting` (local hosts only) forces that state for review and tests.
 */
export function usePatientView<K extends keyof PatientViewSource>(
    name: K,
    token: string,
    options: { refreshMs?: number } = {},
): {
    data: Awaited<ReturnType<PatientViewSource[K]>> | undefined;
    status: PatientViewStatus;
    stale: boolean;
    reload: () => void;
} {
    type Data = Awaited<ReturnType<PatientViewSource[K]>>;
    const source = usePatientLinks();
    const { refreshMs = 0 } = options;
    const forced = useMemo(
        () =>
            typeof window === 'undefined'
                ? null
                : forcedStateFromUrl(
                      window.location.search,
                      window.location.hostname,
                  ),
        [],
    );
    const [data, setData] = useState<Data | undefined>(undefined);
    const [failed, setFailed] = useState(false);
    const [stale, setStale] = useState(false);
    const [version, setVersion] = useState(0);
    const hasData = useRef(false);

    useEffect(() => {
        if (forced === 'loading' || forced === 'error') {
            return;
        }

        let cancelled = false;
        const load = () =>
            (source.views[name] as (token: string) => Promise<Data>)(
                token,
            ).then(
                (value) => {
                    if (!cancelled) {
                        hasData.current = true;
                        setData(value);
                        setFailed(false);
                        setStale(false);
                    }
                },
                () => {
                    if (cancelled) {
                        return;
                    }

                    // A failed refresh keeps the page; a failed first load shows the error.
                    if (hasData.current) {
                        setStale(true);
                    } else {
                        setFailed(true);
                    }
                },
            );

        void load();

        const timer =
            refreshMs > 0 ? window.setInterval(load, refreshMs) : undefined;
        const visible = () => {
            if (document.visibilityState === 'visible') {
                void load();
            }
        };

        if (refreshMs > 0) {
            document.addEventListener('visibilitychange', visible);
        }

        return () => {
            cancelled = true;

            if (timer !== undefined) {
                window.clearInterval(timer);
            }

            document.removeEventListener('visibilitychange', visible);
        };
    }, [source, name, token, refreshMs, version, forced]);

    const reload = useCallback(() => {
        setFailed(false);
        setVersion((v) => v + 1);
    }, []);

    const status: PatientViewStatus =
        forced === 'loading'
            ? 'loading'
            : forced === 'error' || failed
              ? 'error'
              : data === undefined
                ? 'loading'
                : 'ready';

    return {
        data,
        status,
        stale: stale || forced === 'reconnecting',
        reload,
    };
}
