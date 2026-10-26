import { Clock, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';
import { clockMs } from '@/lib/clock';
import type { DataSource, Id, IsoDateTime, SlotHold } from '@/lib/data';
import { formatCountdown } from './format';

/** One slot hold per user, with a live countdown. Picking another slot replaces it. */
export function useHold(source: DataSource) {
    const [hold, setHold] = useState<SlotHold | null>(null);
    const [now, setNow] = useState(() => clockMs());
    const current = useRef<SlotHold | null>(null);

    useEffect(() => {
        current.current = hold;
    }, [hold]);

    useEffect(() => {
        if (!hold) {
            return;
        }

        const timer = window.setInterval(() => setNow(clockMs()), 1000);

        return () => window.clearInterval(timer);
    }, [hold]);

    const start = useCallback(
        async (input: {
            doctorId: Id;
            serviceId: Id;
            startsAt: IsoDateTime;
        }) => {
            const next = await source.slots.hold(input);
            setNow(clockMs());
            setHold(next);

            return next;
        },
        [source],
    );

    const clear = useCallback(() => {
        if (current.current) {
            void source.slots.release(current.current.id);
        }

        setHold(null);
    }, [source]);

    const secondsLeft = hold
        ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000))
        : 0;

    return {
        hold,
        secondsLeft,
        expired: hold !== null && secondsLeft === 0,
        start,
        clear,
    };
}

export function HoldBanner({
    secondsLeft,
    expired,
    onHoldAgain,
}: {
    secondsLeft: number;
    expired: boolean;
    onHoldAgain: () => void;
}) {
    const { t } = useT();

    if (expired) {
        return (
            <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-warning-line bg-warning-surface px-4 py-3 text-control font-semibold text-warning-ink"
            >
                <span className="inline-flex items-center gap-2">
                    <TriangleAlert
                        aria-hidden="true"
                        className="size-[18px] shrink-0"
                    />
                    {t('booking.holdExpired')}
                </span>
                <Button variant="outline" size="sm" onClick={onHoldAgain}>
                    {t('booking.holdAgain')}
                </Button>
            </div>
        );
    }

    return (
        <div
            role="timer"
            className="flex items-center justify-between gap-2.5 rounded-lg border border-brand-line bg-brand-tint px-4 py-3 text-control font-semibold text-brand-deep"
        >
            <span className="inline-flex items-center gap-2">
                <Clock aria-hidden="true" className="size-[18px] shrink-0" />
                {t('booking.holding')}
            </span>
            <span dir="ltr" className="text-lead font-bold">
                {formatCountdown(secondsLeft)}
            </span>
        </div>
    );
}
