import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A time of day with minus and plus buttons that move it by half an hour, for business hours.
 * The buttons keep their visual order (minus, time, plus) in right-to-left pages too.
 */
export function ClockStepper({
    label,
    value,
    earlierLabel,
    laterLabel,
    canEarlier,
    canLater,
    onEarlier,
    onLater,
}: {
    /** What this time is ("Opens"), for the group and the button names. */
    label: string;
    value: string;
    earlierLabel: string;
    laterLabel: string;
    canEarlier: boolean;
    canLater: boolean;
    onEarlier: () => void;
    onLater: () => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            dir="ltr"
            className="inline-flex items-center gap-1"
        >
            <Button
                variant="outline"
                size="icon"
                aria-label={`${earlierLabel} (${label})`}
                disabled={!canEarlier}
                onClick={onEarlier}
            >
                <Minus aria-hidden="true" />
            </Button>
            <span className="min-w-[72px] text-center text-control font-semibold text-ink">
                {value}
            </span>
            <Button
                variant="outline"
                size="icon"
                aria-label={`${laterLabel} (${label})`}
                disabled={!canLater}
                onClick={onLater}
            >
                <Plus aria-hidden="true" />
            </Button>
        </div>
    );
}
