import { useEffect, useState } from 'react';

/** True once the page has scrolled past `threshold` pixels. */
export function useScrolled(threshold = 8): boolean {
    const [scrolled, setScrolled] = useState(
        () => typeof window !== 'undefined' && window.scrollY > threshold,
    );

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > threshold);

        window.addEventListener('scroll', onScroll, { passive: true });

        return () => window.removeEventListener('scroll', onScroll);
    }, [threshold]);

    return scrolled;
}
