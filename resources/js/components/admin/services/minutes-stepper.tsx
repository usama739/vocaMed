import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';

/** A number of minutes with minus and plus buttons (the service's duration and buffer). */
export function MinutesStepper({
    label,
    valueLabel,
    lessLabel,
    moreLabel,
    canLess,
    canMore,
    onLess,
    onMore,
}: {
    label: string;
    /** The value as shown: "30 min". */
    valueLabel: string;
    lessLabel: string;
    moreLabel: string;
    canLess: boolean;
    canMore: boolean;
    onLess: () => void;
    onMore: () => void;
}) {
    const id = useId();

    return (
        <div className="flex flex-col gap-1.5">
            <span id={id} className="text-label font-semibold text-ink">
                {label}
            </span>
            <div
                role="group"
                aria-labelledby={id}
                dir="ltr"
                className="flex items-center gap-1"
            >
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`${lessLabel} (${label})`}
                    disabled={!canLess}
                    onClick={onLess}
                >
                    <Minus aria-hidden="true" />
                </Button>
                <span className="min-w-[84px] text-center text-control font-semibold text-ink">
                    {valueLabel}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`${moreLabel} (${label})`}
                    disabled={!canMore}
                    onClick={onMore}
                >
                    <Plus aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}
