import { useEffect, useRef, useState } from 'react';

const canAnimate = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts from the number on screen to a new one. The first render shows the value as is,
 * and visitors who asked for less motion get the new number at once.
 */
export function useCountUp(value: number, durationMs = 500): number {
    const [shown, setShown] = useState(value);
    const from = useRef(value);

    useEffect(() => {
        if (from.current === value) {
            return;
        }

        if (!canAnimate()) {
            from.current = value;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShown(value);

            return;
        }

        const start = performance.now();
        const origin = from.current;
        let frame = 0;

        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - progress, 3);
            setShown(Math.round(origin + (value - origin) * eased));

            if (progress < 1) {
                frame = requestAnimationFrame(tick);
            } else {
                from.current = value;
            }
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, [value, durationMs]);

    return shown;
}
