import { useEffect, useMemo, useRef, useState } from 'react';
import { useReception } from '@/components/reception/runtime';
import { useData } from '@/hooks/use-data';
import type { DataSource } from '@/lib/data';

export type LiveStatus = 'loading' | 'ready' | 'error';

/**
 * Loads data for a page and keeps it fresh. Gives every page the same four states:
 * `loading`, `ready` (empty is the page's own call), `error` (with `reload`), and, through the
 * layout, reconnecting. Polling stands in for real-time (Reverb) until WebSockets exist; only
 * this hook changes then. A failed refresh keeps the data already on screen.
 *
 * `?state=loading|error|empty` (local hosts) forces that state; `empty` swaps in `options.empty`.
 */
export function useLiveQuery<T>(
    key: string,
    load: (source: DataSource) => Promise<T>,
    options: {
        refreshMs?: number;
        /** What `?state=empty` shows when the page has nothing to build it from. */
        empty?: T;
        /** Builds the empty view from the real data (keeps doctors, filters and so on). */
        emptyFrom?: (data: T) => T;
        keepPrevious?: boolean;
    } = {},
): {
    data: T | undefined;
    status: LiveStatus;
    reload: () => void;
    /** The last refresh failed but older data is still shown. */
    stale: boolean;
} {
    const source = useData();
    const { forced, epoch } = useReception();
    const { refreshMs = 5000, empty, keepPrevious = false } = options;
    const [state, setState] = useState<{ key: string; value: T } | null>(null);
    const [failedKey, setFailedKey] = useState<string | null>(null);
    const [stale, setStale] = useState(false);
    const [version, setVersion] = useState(0);
    const loader = useRef(load);
    const hasData = useRef(false);

    useEffect(() => {
        loader.current = load;
    });

    useEffect(() => {
        if (forced === 'loading' || forced === 'error') {
            return;
        }

        let cancelled = false;

        loader.current(source).then(
            (value) => {
                if (!cancelled) {
                    hasData.current = true;
                    setState({ key, value });
                    setFailedKey(null);
                    setStale(false);
                }
            },
            () => {
                if (cancelled) {
                    return;
                }

                if (hasData.current && state?.key === key) {
                    setStale(true);
                } else {
                    setFailedKey(key);
                }
            },
        );

        return () => {
            cancelled = true;
        };
        // `state` is read only to decide stale vs failed; it must not retrigger the load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version, epoch, forced, source]);

    useEffect(() => {
        if (!refreshMs || forced === 'loading' || forced === 'error') {
            return;
        }

        const timer = window.setInterval(() => {
            if (!document.hidden) {
                setVersion((v) => v + 1);
            }
        }, refreshMs);

        return () => window.clearInterval(timer);
    }, [refreshMs, forced]);

    const current =
        state && (state.key === key || keepPrevious) ? state.value : undefined;
    const status: LiveStatus =
        forced === 'loading'
            ? 'loading'
            : forced === 'error'
              ? 'error'
              : current !== undefined
                ? 'ready'
                : failedKey === key
                  ? 'error'
                  : 'loading';

    const shown = status === 'ready' ? current : undefined;
    // Built once per load, so the page sees a stable object rather than a new one every render.
    const emptied = useMemo(
        () =>
            forced === 'empty' && shown !== undefined
                ? options.emptyFrom?.(shown)
                : undefined,
        // `options.emptyFrom` is a new function every render; the empty view only depends on the data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [forced, shown],
    );

    return {
        data: forced === 'empty' ? (emptied ?? empty ?? shown) : shown,
        status,
        stale,
        reload: () => {
            setFailedKey(null);
            setVersion((v) => v + 1);
        },
    };
}
