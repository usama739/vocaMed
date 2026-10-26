import { useCallback, useRef, useState } from 'react';

/**
 * Filter state kept in the address bar (`?doctor=&status=&page=`), so a refresh or a shared
 * link keeps the same view. Values equal to their default are left out of the URL. Uses
 * `history.replaceState`, so typing in a search box never adds history entries or server visits.
 */
export function useUrlParams<T extends Record<string, string>>(
    defaults: T,
): [T, (patch: Partial<T>) => void] {
    const keys = Object.keys(defaults) as (keyof T & string)[];

    const read = (): T => {
        const search =
            typeof window === 'undefined' ? '' : window.location.search;
        const query = new URLSearchParams(search);

        return Object.fromEntries(
            keys.map((key) => [key, query.get(key) ?? defaults[key]]),
        ) as T;
    };

    const [params, setParams] = useState<T>(read);
    const latest = useRef(params);

    const update = useCallback(
        (patch: Partial<T>) => {
            const next = { ...latest.current, ...patch } as T;
            latest.current = next;
            setParams(next);

            const query = new URLSearchParams(window.location.search);

            for (const key of Object.keys(defaults)) {
                const value = next[key];

                if (value === defaults[key] || value === '') {
                    query.delete(key);
                } else {
                    query.set(key, value);
                }
            }

            const search = query.toString();
            window.history.replaceState(
                window.history.state,
                '',
                `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
            );
        },
        // `defaults` is a literal at the call site; only its values matter, and they are constant.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    return [params, update];
}
