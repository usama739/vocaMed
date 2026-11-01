import { useEffect, useMemo, useRef, useState } from 'react';
import { useReception } from '@/components/reception/runtime';
import { useData } from '@/hooks/use-data';
import type { DataSource } from '@/lib/data';
import { subscribeLive, useLiveStatus, type LiveTopic } from '@/lib/live';

/** With the live line up, a page still refreshes this often as a safety net (a missed announcement, a hold that ran out). */
export const LIVE_SAFETY_MS = 60_000;

export type LiveOptions<T> = {
    refreshMs?: number;
    /** What announcements make the page read again (see `lib/live-topics`). Ignored when the page does not refresh (`refreshMs` 0). */
    topics?: readonly LiveTopic[];
    /** How long a burst of announcements settles before the one reload. */
    debounceMs?: number;
    /** What `?state=empty` shows when the page has nothing to build it from. */
    empty?: T;
    /** Builds the empty view from the real data (keeps doctors, filters and so on). */
    emptyFrom?: (data: T) => T;
    keepPrevious?: boolean;
};

export type LiveStatus = 'loading' | 'ready' | 'error';

/**
 * Loads data for a page and keeps it fresh. Gives every page the same four states:
 * `loading`, `ready` (empty is the page's own call), `error` (with `reload`), and, through the
 * layout, reconnecting. With the live line up (Reverb; see `lib/live`) the page reads again when the
 * server announces a change to what it shows, and the timer is only a slow safety net; without it
 * (the open demo, a dropped line) the timer does the work. A failed refresh keeps the data already on screen.
 *
 * `?state=loading|error|empty` (local hosts) forces that state; `empty` swaps in `options.empty`.
 */
export function useLiveQuery<T>(
    key: string,
    load: (source: DataSource) => Promise<T>,
    options: LiveOptions<T> = {},
): {
    data: T | undefined;
    status: LiveStatus;
    reload: () => void;
    /** The last refresh failed but older data is still shown. */
    stale: boolean;
} {
    const source = useData();
    const { forced, epoch } = useReception();
    const {
        refreshMs = 5000,
        empty,
        keepPrevious = false,
        topics,
        debounceMs = 300,
    } = options;
    const live = useLiveStatus() === 'connected';
    // A page that was never meant to refresh (a form) stays out of live updates too.
    const listensLive = !!refreshMs && !!topics?.length;
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

    // With the live line up the timer is only a safety net; without it, the page refreshes as it always did.
    const intervalMs = listensLive && live ? LIVE_SAFETY_MS : refreshMs;

    useEffect(() => {
        if (!intervalMs || forced === 'loading' || forced === 'error') {
            return;
        }

        const timer = window.setInterval(() => {
            if (!document.hidden) {
                setVersion((v) => v + 1);
            }
        }, intervalMs);

        return () => window.clearInterval(timer);
    }, [intervalMs, forced]);

    // An announcement for something this page shows: read again once the burst has settled.
    const topicKey = topics?.join(',') ?? '';

    useEffect(() => {
        if (!listensLive || forced === 'loading' || forced === 'error') {
            return;
        }

        let timer: number | undefined;
        const stop = subscribeLive(topics ?? [], () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setVersion((v) => v + 1), debounceMs);
        });

        return () => {
            stop();
            window.clearTimeout(timer);
        };
        // `topics` is a new array every render; its content is `topicKey`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listensLive, topicKey, debounceMs, forced]);

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
