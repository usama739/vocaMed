import { useEffect, useRef, useState } from 'react';
import { subscribeLive, useLiveStatus, type LiveTopic } from '@/lib/live';

/**
 * Loads a value when `key` changes, optionally refreshing it. `loading` is true until the value for
 * the *current* key has arrived, so stale data from a previous key is never shown as current.
 *
 * With `topics`, the value is also read again when the server announces a change to what it shows (the live
 * line, see `lib/live`); the timer then only runs every `liveRefreshMs` as a safety net.
 */
export function useAsyncValue<T>(
    key: string | null,
    load: () => Promise<T>,
    options: {
        refreshMs?: number;
        topics?: readonly LiveTopic[];
        /** The safety-net timer while the live line is up. */
        liveRefreshMs?: number;
        debounceMs?: number;
    } = {},
): { value: T | undefined; loading: boolean; reload: () => void } {
    const [state, setState] = useState<{ key: string; value: T } | null>(null);
    const [version, setVersion] = useState(0);
    const loader = useRef(load);
    const {
        refreshMs = 0,
        topics,
        liveRefreshMs = 15_000,
        debounceMs = 300,
    } = options;
    const live = useLiveStatus() === 'connected';
    const listensLive = !!refreshMs && !!topics?.length;
    const intervalMs = listensLive && live ? liveRefreshMs : refreshMs;
    const topicKey = topics?.join(',') ?? '';

    useEffect(() => {
        loader.current = load;
    });

    useEffect(() => {
        if (key === null) {
            return;
        }

        let cancelled = false;

        loader.current().then(
            (value) => {
                if (!cancelled) {
                    setState({ key, value });
                }
            },
            () => {
                // Callers surface failures through their own actions; a failed refresh keeps old data.
            },
        );

        return () => {
            cancelled = true;
        };
    }, [key, version]);

    useEffect(() => {
        if (!intervalMs || key === null) {
            return;
        }

        const timer = window.setInterval(
            () => setVersion((v) => v + 1),
            intervalMs,
        );

        return () => window.clearInterval(timer);
    }, [intervalMs, key]);

    useEffect(() => {
        if (!listensLive || key === null) {
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
    }, [listensLive, topicKey, debounceMs, key]);

    const current = state && state.key === key ? state.value : undefined;

    return {
        value: current,
        loading: key !== null && current === undefined,
        reload: () => setVersion((v) => v + 1),
    };
}
