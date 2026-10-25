import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fades its children up once, the first time they scroll into view. `delay` (ms) staggers
 * siblings. Under reduced motion, or without IntersectionObserver, content is simply shown.
 */
export function Reveal({
    children,
    delay = 0,
    as = 'div',
    className,
}: {
    children: ReactNode;
    delay?: number;
    as?: 'div' | 'li' | 'section' | 'article';
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(
        () => typeof IntersectionObserver === 'undefined',
    );

    useEffect(() => {
        const node = ref.current;

        if (!node || seen) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setSeen(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [seen]);

    const Tag = as as 'div';

    return (
        <Tag
            ref={ref}
            data-in={seen}
            className={cn('reveal', className)}
            style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
        >
            {children}
        </Tag>
    );
}
