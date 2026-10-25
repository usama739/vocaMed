import { useEffect, useRef } from 'react';

function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );
}

/**
 * Single-key shortcut (N, /, M on the receptionist screens). Ignored while typing in a field
 * and when a modifier key is held, so it never fights the browser or the form.
 */
export function useShortcut(
    key: string,
    handler: () => void,
    enabled = true,
): void {
    const latest = useRef(handler);

    useEffect(() => {
        latest.current = handler;
    });

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() !== key.toLowerCase() ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                event.defaultPrevented ||
                isTyping(event.target)
            ) {
                return;
            }

            event.preventDefault();
            latest.current();
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, [key, enabled]);
}
