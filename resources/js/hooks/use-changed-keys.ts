import { useEffect, useRef, useState } from 'react';

/**
 * Keys of rows whose signature changed since the last load, for a short while, so the page can
 * flash them (a status someone else just changed). Nothing flashes on the first load.
 */
export function useChangedKeys<T>(
    items: T[] | undefined,
    key: (item: T) => string,
    signature: (item: T) => string,
    holdMs = 1800,
): ReadonlySet<string> {
    const previous = useRef<Map<string, string> | null>(null);
    const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());

    useEffect(() => {
        if (!items) {
            return;
        }

        const next = new Map(items.map((i) => [key(i), signature(i)]));
        const before = previous.current;
        previous.current = next;

        if (!before) {
            return;
        }

        const flagged = [...next].filter(
            ([k, sig]) => before.has(k) && before.get(k) !== sig,
        );

        if (flagged.length === 0) {
            return;
        }

        setChanged(new Set(flagged.map(([k]) => k)));
        const timer = window.setTimeout(() => setChanged(new Set()), holdMs);

        return () => window.clearTimeout(timer);
        // key and signature are pure helpers from the call site.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, holdMs]);

    return changed;
}
