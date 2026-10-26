import { cn } from '@/lib/utils';

/**
 * An on/off switch with a 44px touch target. The visible track is the designed 52 by 30; the
 * button around it is what the finger hits. Used for days, services, voice and "accepting bookings".
 */
export function ToggleSwitch({
    checked,
    label,
    labelledBy,
    onChange,
    disabled,
    className,
}: {
    checked: boolean;
    /** The accessible name, e.g. "Monday" or the service. Omit when `labelledBy` points at visible text. */
    label?: string;
    labelledBy?: string;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-labelledby={labelledBy}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-11 w-[60px] shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'relative h-[30px] w-[52px] rounded-full transition-colors duration-200 ease-out',
                    checked ? 'bg-brand' : 'bg-[#aeb6c8]',
                )}
            >
                <span
                    className={cn(
                        'absolute top-[3px] size-6 rounded-full bg-white shadow-xs transition-[inset] duration-200 ease-out',
                        checked ? 'end-[3px]' : 'start-[3px]',
                    )}
                />
            </span>
        </button>
    );
}
