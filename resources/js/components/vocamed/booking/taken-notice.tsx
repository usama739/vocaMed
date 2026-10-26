import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';
import type { Slot } from '@/lib/data';
import { formatClock } from './format';

/** "That time is already taken": offers the nearest free times as one-tap alternatives. */
export function TakenNotice({
    time,
    alternatives,
    timeZone,
    onPick,
}: {
    time: string;
    alternatives: Slot[];
    timeZone: string;
    onPick: (slot: Slot) => void;
}) {
    const { t } = useT();

    return (
        <div
            role="alert"
            className="flex flex-col gap-2.5 rounded-lg border border-warning-line bg-warning-surface px-4 py-3.5 text-control text-warning-ink"
        >
            <strong>{t('booking.takenTitle', { time })}</strong>
            <span>{t('booking.takenBody')}</span>
            <div className="flex flex-wrap gap-2">
                {alternatives.map((slot) => (
                    <Button
                        key={slot.startsAt}
                        variant="outline"
                        className="min-w-[84px] font-bold"
                        onClick={() => onPick(slot)}
                    >
                        <span dir="ltr">
                            {formatClock(slot.startsAt, timeZone)}
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
