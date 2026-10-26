import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The day switch is the shared 44px-target switch; it keeps its old name here.
export { ToggleSwitch as DaySwitch } from '@/components/vocamed/toggle-switch';

/** "From 09:00" with minus and plus buttons that move it by half an hour. */
export function TimeStepper({
    label,
    value,
    earlierLabel,
    laterLabel,
    canEarlier,
    canLater,
    onEarlier,
    onLater,
}: {
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
            className="inline-flex items-center gap-1.5"
        >
            <span className="text-label text-subtle">{label}</span>
            <Button
                variant="outline"
                size="icon"
                aria-label={`${earlierLabel} (${label})`}
                disabled={!canEarlier}
                onClick={onEarlier}
            >
                <Minus aria-hidden="true" />
            </Button>
            <span
                dir="ltr"
                className="min-w-[58px] text-center text-body font-bold text-ink"
            >
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

/** One weekday's bar in the preview: grows smoothly when the count changes. */
export function BarMeter({
    name,
    count,
    max,
    countLabel,
}: {
    name: string;
    count: number;
    max: number;
    countLabel: string;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="w-11 shrink-0 text-label font-semibold text-ink">
                {name}
            </span>
            <span
                aria-hidden="true"
                className="h-3 flex-1 overflow-hidden rounded-[6px] bg-status-booked/60"
            >
                <span
                    className="block h-full rounded-[6px] bg-brand transition-[width] duration-300 ease-out"
                    style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
                />
            </span>
            <span className="min-w-16 text-end text-label font-bold text-ink">
                {countLabel}
            </span>
        </div>
    );
}
