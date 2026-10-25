import { cn } from '@/lib/utils';

/** The VocaMed mark: a voice waveform on the brand blue. Decorative; the wordmark carries the name. */
export function BrandMark({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-brand',
                className,
            )}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeLinecap="round"
            >
                <path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2" />
            </svg>
        </span>
    );
}
