import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A pressable option (doctor, service, day, status filter). Selection is shown by a tick
 * as well as the blue fill, so it never relies on colour alone.
 */
export function ChoiceChip({
    pressed,
    shape = 'rounded',
    className,
    children,
    ...props
}: Omit<ComponentProps<'button'>, 'aria-pressed'> & {
    pressed: boolean;
    shape?: 'rounded' | 'pill';
}) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            className={cn(
                'inline-flex items-center justify-center gap-1.5 border px-4 text-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                shape === 'pill'
                    ? 'min-h-11 rounded-full'
                    : 'min-h-12 rounded-md',
                pressed
                    ? 'border-brand bg-brand-tint text-brand-deep'
                    : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                className,
            )}
            {...props}
        >
            {pressed && (
                <Check
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    strokeWidth={3}
                />
            )}
            {children}
        </button>
    );
}
