import { useT } from '@/i18n/scope';
import type { Slot } from '@/lib/data';
import { cn } from '@/lib/utils';
import { formatClock } from './format';

/**
 * Free times for one doctor and day. A slot another receptionist is holding stays visible
 * but disabled and says "Held", so nobody wonders where it went. Your own hold stays
 * selectable.
 */
export function SlotPicker({
    slots,
    loading,
    selected,
    timeZone,
    onSelect,
}: {
    slots: Slot[] | undefined;
    loading?: boolean;
    selected: string | null;
    timeZone: string;
    onSelect: (slot: Slot) => void;
}) {
    const { t } = useT();

    if (loading || !slots) {
        return (
            <p role="status" className="text-control">
                {t('states.loading')}
            </p>
        );
    }

    if (slots.length === 0) {
        return <p className="text-control">{t('booking.noSlots')}</p>;
    }

    return (
        <ul className="grid grid-cols-4 gap-2">
            {slots.map((slot) => {
                const held = slot.state === 'held' && !slot.heldByMe;
                const on = !held && slot.startsAt === selected;
                const clock = formatClock(slot.startsAt, timeZone);

                return (
                    <li key={slot.startsAt} className="contents">
                        <button
                            type="button"
                            disabled={held}
                            aria-pressed={on}
                            aria-label={
                                held ? `${clock}, ${t('booking.held')}` : clock
                            }
                            onClick={() => onSelect(slot)}
                            className={cn(
                                'flex min-h-14 flex-col items-center justify-center rounded-md border text-control font-bold',
                                held
                                    ? 'cursor-not-allowed border-dashed border-line-strong bg-surface-held text-subtle'
                                    : on
                                      ? 'border-brand bg-brand-tint text-brand-deep'
                                      : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                            )}
                        >
                            <span dir="ltr">{clock}</span>
                            {held && (
                                <span className="text-caption font-semibold">
                                    {t('booking.held')}
                                </span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
