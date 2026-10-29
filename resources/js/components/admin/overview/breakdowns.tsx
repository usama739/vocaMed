import type { ReactNode } from 'react';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 100) : 0;

/** A card for one breakdown: title, a line under it, then the chart. */
export function InsightCard({
    id,
    title,
    sub,
    delay = 0,
    children,
}: {
    id: string;
    title: string;
    sub: string;
    delay?: number;
    children: ReactNode;
}) {
    return (
        <section
            aria-labelledby={id}
            style={{ animationDelay: `${delay}ms` }}
            className="flex animate-rise flex-col gap-3.5 rounded-xl border border-line bg-white p-5 shadow-soft motion-reduce:animate-none"
        >
            <div className="flex flex-col gap-0.5">
                <h2 id={id} className="text-lead font-semibold text-ink">
                    {title}
                </h2>
                <span className="text-label">{sub}</span>
            </div>
            {children}
        </section>
    );
}

/** Appointments for each weekday, Monday first; the busiest day is the strong blue. */
export function WeekdayBars({ counts }: { counts: number[] }) {
    const { t } = useT();
    // Monday first, as the view gives them; the copy is keyed by JavaScript weekday (Sunday is 0).
    const weekday = (index: number) => (index + 1) % 7;
    const max = Math.max(1, ...counts);
    const busiest = counts.indexOf(Math.max(...counts));
    const closed = counts
        .map((n, i) => (n === 0 ? i : -1))
        .filter((i) => i >= 0)
        .map((i) => t(`admin.overview.weekdays.long.${weekday(i)}`));

    return (
        <>
            <div
                dir="ltr"
                role="img"
                aria-label={counts
                    .map((n, i) =>
                        t('admin.overview.weekdays.bar', {
                            day: t(
                                `admin.overview.weekdays.long.${weekday(i)}`,
                            ),
                            count: n,
                        }),
                    )
                    .join('. ')}
                className="flex h-[200px] items-end gap-2.5 border-b border-[#aeb6c8] pt-5"
            >
                {counts.map((n, index) => (
                    <div
                        key={index}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                        <span className="text-small font-bold text-ink">
                            {n}
                        </span>
                        <span
                            title={t('admin.overview.weekdays.bar', {
                                day: t(
                                    `admin.overview.weekdays.long.${weekday(index)}`,
                                ),
                                count: n,
                            })}
                            style={{
                                height: Math.max(
                                    4,
                                    Math.round((n / max) * 140),
                                ),
                            }}
                            className={cn(
                                'block w-full max-w-11 rounded-t-[6px] transition-[height] duration-300 ease-out',
                                n === max ? 'bg-brand' : 'bg-[#9cbff2]',
                            )}
                        />
                    </div>
                ))}
            </div>
            <div dir="ltr" aria-hidden="true" className="flex gap-2.5">
                {counts.map((_, index) => (
                    <span
                        key={index}
                        className="flex-1 text-center text-small text-copy"
                    >
                        {t(`admin.overview.weekdays.short.${weekday(index)}`)}
                    </span>
                ))}
            </div>
            <p className="text-label font-bold text-ink">
                {t('admin.overview.weekdays.busiest', {
                    day: t(`admin.overview.weekdays.long.${weekday(busiest)}`),
                })}
                {closed.length > 0 && (
                    <>
                        {' '}
                        {t('admin.overview.weekdays.closed', {
                            days: closed.join(' · '),
                        })}
                    </>
                )}
            </p>
        </>
    );
}

const OUTCOME_COLOUR = {
    done: '#1366d6',
    upcoming: '#9cbff2',
    cancelled: '#7a869f',
    noShow: '#d9822b',
} as const;

/** A stacked bar of what became of the bookings, with a legend that names every share. */
export function OutcomeBar({
    outcomes,
}: {
    outcomes: {
        done: number;
        upcoming: number;
        cancelled: number;
        noShow: number;
    };
}) {
    const { t } = useT();
    const total =
        outcomes.done +
        outcomes.upcoming +
        outcomes.cancelled +
        outcomes.noShow;
    const parts = (['done', 'upcoming', 'cancelled', 'noShow'] as const)
        .map((key) => ({ key, n: outcomes[key] }))
        .filter((p) => p.n > 0);

    return (
        <>
            <div
                dir="ltr"
                role="img"
                aria-label={t('admin.overview.outcomes.aria')}
                className="flex h-7 gap-0.5"
            >
                {parts.map((p) => (
                    <span
                        key={p.key}
                        style={{
                            width: `${(p.n / total) * 100}%`,
                            background: OUTCOME_COLOUR[p.key],
                        }}
                        className="h-full rounded-[4px] transition-[width] duration-300 ease-out"
                    />
                ))}
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2.5 p-0">
                {parts.map((p) => (
                    <li
                        key={p.key}
                        className="flex items-center gap-2.5 text-[14.5px] text-ink"
                    >
                        <span
                            aria-hidden="true"
                            style={{ background: OUTCOME_COLOUR[p.key] }}
                            className="size-3 shrink-0 rounded-[3px]"
                        />
                        <span className="flex-1">
                            {t(`admin.overview.outcomes.${p.key}`)}
                        </span>
                        <strong>
                            {p.n} ({pct(p.n, total)}%)
                        </strong>
                    </li>
                ))}
            </ul>
        </>
    );
}

/** Voice against manual bookings. */
export function SourceBar({
    voice,
    manual,
}: {
    voice: number;
    manual: number;
}) {
    const { t } = useT();
    const total = voice + manual;

    return (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-3.5">
            <span className="text-label font-semibold text-copy">
                {t('admin.overview.sources.title')}
            </span>
            <div
                dir="ltr"
                aria-hidden="true"
                className="flex h-3 overflow-hidden rounded-[6px] bg-line"
            >
                <span
                    style={{ width: `${pct(voice, total)}%` }}
                    className="block h-full bg-brand transition-[width] duration-300 ease-out"
                />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-label font-semibold text-ink">
                <span className="flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className="size-3 rounded-[3px] bg-brand"
                    />
                    {t('admin.overview.sources.voice')}: {voice} (
                    {pct(voice, total)}%)
                </span>
                <span className="flex items-center gap-2">
                    <span
                        aria-hidden="true"
                        className="size-3 rounded-[3px] border border-[#aeb6c8] bg-line"
                    />
                    {t('admin.overview.sources.manual')}: {manual}
                </span>
            </div>
        </div>
    );
}

/** A named bar with its share and how many appointments that is (doctor time, services). */
export function ShareBar({
    name,
    share,
    booked,
    strong = true,
}: {
    name: string;
    /** 0 to 1. */
    share: number;
    booked: number;
    strong?: boolean;
}) {
    const { t } = useT();

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2.5 text-[14.5px] text-ink">
                <span className="font-semibold">{name}</span>
                <span>
                    <strong>{Math.round(share * 100)}%</strong> ·{' '}
                    {t('admin.overview.appointments', { count: booked })}
                </span>
            </div>
            <div
                dir="ltr"
                aria-hidden="true"
                className="h-3 overflow-hidden rounded-[6px] bg-[#eef1f6]"
            >
                <span
                    style={{ width: `${share * 100}%` }}
                    className={cn(
                        'block h-full rounded-[6px] transition-[width] duration-300 ease-out',
                        strong ? 'bg-brand' : 'bg-[#9cbff2]',
                    )}
                />
            </div>
        </div>
    );
}
