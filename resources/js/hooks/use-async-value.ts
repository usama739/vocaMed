import { useEffect, useRef, useState } from 'react';

/**
 * Loads a value when `key` changes, optionally polling. `loading` is true until the value for
 * the *current* key has arrived, so stale data from a previous key is never shown as current.
 * This is the seam where real-time (Reverb) updates replace polling later.
 */
export function useAsyncValue<T>(
    key: string | null,
    load: () => Promise<T>,
    options: { refreshMs?: number } = {},
): { value: T | undefined; loading: boolean; reload: () => void } {
    const [state, setState] = useState<{ key: string; value: T } | null>(null);
    const [version, setVersion] = useState(0);
    const loader = useRef(load);
    const { refreshMs = 0 } = options;

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
        if (!refreshMs || key === null) {
            return;
        }

        const timer = window.setInterval(
            () => setVersion((v) => v + 1),
            refreshMs,
        );

        return () => window.clearInterval(timer);
    }, [refreshMs, key]);

    const current = state && state.key === key ? state.value : undefined;

    return {
        value: current,
        loading: key !== null && current === undefined,
        reload: () => setVersion((v) => v + 1),
    };
}
