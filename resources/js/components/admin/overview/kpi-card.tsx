import { ArrowDown, ArrowUp, Minus, type LucideIcon } from 'lucide-react';
import { useCountUp } from '@/hooks/use-count-up';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';
import { formatDelta, type KpiDelta } from './model';

const TONE = {
    good: 'bg-[#dff3e4] text-[#14532d]',
    bad: 'bg-[#fdebef] text-[#7a0e2e]',
    flat: 'bg-[#e8ecf4] text-[#2f3a56]',
} as const;

/**
 * One headline number: an icon and label, the value, how it moved since the period before, and what
 * it was then. The value counts to its new figure when the period changes. A rate counts in tenths so
 * its decimal survives.
 */
export function KpiCard({
    icon: Icon,
    label,
    value,
    suffix = '',
    previous,
    delta,
    index,
}: {
    icon: LucideIcon;
    label: string;
    value: number;
    /** `%` for a rate. */
    suffix?: string;
    previous: number;
    delta: KpiDelta | null;
    index: number;
}) {
    const { t } = useT();
    const tenths = useCountUp(Math.round(value * 10), 600);
    const shown = suffix ? tenths / 10 : Math.round(tenths / 10);
    const arrow =
        delta?.direction === 'up'
            ? ArrowUp
            : delta?.direction === 'down'
              ? ArrowDown
              : Minus;
    const Arrow = arrow;
    const change = delta
        ? delta.diff === 0
            ? t('admin.overview.noChange')
            : formatDelta(delta, t('admin.overview.pts'))
        : null;
    const verdict =
        delta && delta.tone !== 'flat'
            ? t(
                  delta.tone === 'good'
                      ? 'admin.overview.better'
                      : 'admin.overview.worse',
              )
            : null;

    return (
        <div
            style={{ animationDelay: `${index * 40}ms` }}
            className="flex animate-rise flex-col gap-2 rounded-xl border border-line bg-white px-5 py-[18px] shadow-card motion-reduce:animate-none"
        >
            <div className="flex items-center gap-2.5">
                <span
                    aria-hidden="true"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-tint text-brand-deep"
                >
                    <Icon className="size-[19px]" />
                </span>
                <span className="text-label font-semibold text-copy">
                    {label}
                </span>
            </div>
            <span
                dir="ltr"
                className="text-start text-[32px] leading-[1.2] font-bold tracking-[-0.02em] text-ink"
            >
                {shown}
                {suffix}
            </span>
            <div className="flex flex-wrap items-center gap-2">
                {change !== null && delta ? (
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-small font-bold',
                            TONE[delta.tone],
                        )}
                    >
                        <Arrow
                            aria-hidden="true"
                            className="size-3.5"
                            strokeWidth={2.6}
                        />
                        <span dir="ltr">{change}</span>
                        {verdict && <span className="sr-only">{verdict}</span>}
                    </span>
                ) : (
                    <span className="text-small text-subtle">
                        {t('admin.overview.noPrevious')}
                    </span>
                )}
                <span className="text-small text-subtle">
                    {t('admin.overview.before', {
                        value: `${previous}${suffix}`,
                    })}
                </span>
            </div>
        </div>
    );
}
