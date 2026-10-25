import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
    const media = window.matchMedia(QUERY);

    media.addEventListener('change', callback);

    return () => media.removeEventListener('change', callback);
}

/** True when the visitor asked their system for less motion. */
export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(QUERY).matches,
        () => false,
    );
}
