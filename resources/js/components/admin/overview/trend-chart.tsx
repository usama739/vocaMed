import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';
import type { AdminPeriod, TrendPoint } from '@/lib/data';
import { cn } from '@/lib/utils';
import {
    areaPath,
    axisIndexes,
    chartTop,
    chartX,
    chartY,
    linePath,
    trendLabel,
} from './model';

/**
 * Bookings over time: this period as a solid line, the period before as a dashed one, with a
 * guide, dots and a tooltip under the pointer. The same numbers are always available as a table,
 * which is how a keyboard or screen-reader user reads them; the chart itself is one labelled image.
 * Time runs left to right in both languages.
 */
export function TrendChart({
    points,
    granularity,
    period,
}: {
    points: TrendPoint[];
    granularity: 'day' | 'week';
    period: AdminPeriod;
}) {
    const { t, locale } = useT();
    const [hover, setHover] = useState(-1);
    const [table, setTable] = useState(false);

    const model = useMemo(() => {
        const top = chartTop(points);
        const current = points.map((p) => p.current);
        const previous = points.map((p) => p.previous);

        return {
            top,
            current,
            previous,
            labels: points.map((p) => trendLabel(p.date, period, locale)),
            total: current.reduce((a, b) => a + b, 0),
            totalPrevious: previous.reduce((a, b) => a + b, 0),
        };
    }, [points, period, locale]);

    const count = points.length;
    const active = hover >= 0 && hover < count ? hover : -1;
    const hoverX = active >= 0 ? chartX(active, count) : 0;
    const flip = hoverX > 70;
    const dot = (value: number, colour: string, size: number) => ({
        width: size,
        height: size,
        left: `${hoverX}%`,
        top: `${chartY(value, model.top)}%`,
        background: colour,
        boxShadow: `0 0 0 1px ${colour}`,
    });

    return (
        <section
            aria-labelledby="trend-title"
            className="flex animate-rise flex-col gap-3.5 rounded-xl border border-line bg-white p-5 [animation-delay:120ms] motion-reduce:animate-none"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2
                        id="trend-title"
                        className="text-lead font-semibold text-ink"
                    >
                        {t('admin.overview.trend.title')}
                    </h2>
                    <span className="text-label">
                        {t(
                            granularity === 'week'
                                ? 'admin.overview.trend.subWeek'
                                : 'admin.overview.trend.subDay',
                        )}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-2 text-small font-semibold text-ink">
                        <svg aria-hidden="true" width="28" height="8">
                            <path
                                d="M0 4h28"
                                stroke="#1366d6"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                        </svg>
                        {t('admin.overview.trend.thisPeriod')}
                    </span>
                    <span className="inline-flex items-center gap-2 text-small font-semibold text-ink">
                        <svg aria-hidden="true" width="28" height="8">
                            <path
                                d="M0 4h28"
                                stroke="#7a869f"
                                strokeWidth="2.5"
                                strokeDasharray="5 4"
                                strokeLinecap="round"
                            />
                        </svg>
                        {t('admin.overview.trend.previousPeriod')}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-pressed={table}
                        onClick={() => setTable((v) => !v)}
                    >
                        {t(
                            table
                                ? 'admin.overview.trend.showChart'
                                : 'admin.overview.trend.showTable',
                        )}
                    </Button>
                </div>
            </div>

            {!table && (
                <div className="flex gap-2">
                    <div
                        aria-hidden="true"
                        className="relative h-60 w-10 shrink-0"
                    >
                        {[0, 1, 2, 3, 4].map((k) => (
                            <span
                                key={k}
                                style={{ top: `calc(${100 - k * 25}% - 9px)` }}
                                className="absolute end-1.5 text-end text-[12.5px] text-subtle"
                            >
                                {(model.top / 4) * k}
                            </span>
                        ))}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div
                            dir="ltr"
                            role="img"
                            aria-label={t('admin.overview.trend.aria', {
                                count,
                                total: model.total,
                                previous: model.totalPrevious,
                            })}
                            data-testid="trend-chart"
                            className="relative h-60"
                        >
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                className="absolute inset-0 size-full overflow-visible"
                            >
                                <path
                                    d="M0 25H100M0 50H100M0 75H100"
                                    fill="none"
                                    stroke="#e4e7ee"
                                    strokeWidth="1"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <path
                                    d="M0 100H100"
                                    fill="none"
                                    stroke="#aeb6c8"
                                    strokeWidth="1"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <path
                                    d={areaPath(model.current, model.top)}
                                    fill="#1366d6"
                                    fillOpacity="0.08"
                                    stroke="none"
                                />
                                <path
                                    d={linePath(model.previous, model.top)}
                                    fill="none"
                                    stroke="#7a869f"
                                    strokeWidth="2"
                                    strokeDasharray="5 4"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <path
                                    d={linePath(model.current, model.top)}
                                    fill="none"
                                    stroke="#1366d6"
                                    strokeWidth="2.5"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>
                            {active >= 0 && (
                                <>
                                    <div
                                        aria-hidden="true"
                                        style={{ left: `${hoverX}%` }}
                                        className="pointer-events-none absolute inset-y-0 w-0 border-s border-dashed border-[#aeb6c8]"
                                    />
                                    <div
                                        aria-hidden="true"
                                        style={dot(
                                            model.previous[active],
                                            '#7a869f',
                                            11,
                                        )}
                                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                                    />
                                    <div
                                        aria-hidden="true"
                                        style={dot(
                                            model.current[active],
                                            '#1366d6',
                                            13,
                                        )}
                                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                                    />
                                    <div
                                        aria-hidden="true"
                                        style={
                                            flip
                                                ? {
                                                      right: `${100 - hoverX + 2}%`,
                                                  }
                                                : { left: `${hoverX + 2}%` }
                                        }
                                        className="pointer-events-none absolute top-1 z-[5] rounded-[10px] border border-line-strong bg-white px-3 py-2 whitespace-nowrap shadow-menu"
                                    >
                                        <strong className="block text-small text-ink">
                                            {model.labels[active]}
                                        </strong>
                                        <span className="block text-small text-ink">
                                            <span className="font-bold text-brand-deep">
                                                ●
                                            </span>{' '}
                                            {t(
                                                'admin.overview.trend.thisPeriod',
                                            )}
                                            :{' '}
                                            <strong>
                                                {model.current[active]}
                                            </strong>
                                        </span>
                                        <span className="block text-small text-ink">
                                            <span className="font-bold text-subtle">
                                                ○
                                            </span>{' '}
                                            {t(
                                                'admin.overview.trend.previousPeriod',
                                            )}
                                            :{' '}
                                            <strong>
                                                {model.previous[active]}
                                            </strong>
                                        </span>
                                    </div>
                                </>
                            )}
                            <div
                                className="absolute inset-0 flex"
                                onMouseLeave={() => setHover(-1)}
                            >
                                {points.map((point, index) => (
                                    <div
                                        key={point.date}
                                        onMouseEnter={() => setHover(index)}
                                        className="flex-1 hover:bg-brand/[0.06]"
                                    />
                                ))}
                            </div>
                        </div>
                        <div
                            dir="ltr"
                            aria-hidden="true"
                            className="relative h-[22px]"
                        >
                            {axisIndexes(count).map((index) => (
                                <span
                                    key={index}
                                    style={{ left: `${chartX(index, count)}%` }}
                                    className="absolute top-1 -translate-x-1/2 text-[12.5px] whitespace-nowrap text-subtle"
                                >
                                    {model.labels[index]}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {table && (
                <div className="max-h-[300px] overflow-auto rounded-lg border border-line">
                    <div
                        role="table"
                        aria-label={t('admin.overview.trend.title')}
                        className="min-w-[360px]"
                    >
                        <div
                            role="row"
                            className="grid grid-cols-[1.2fr_1fr_1fr] gap-3 border-b border-line bg-surface-subtle px-4 py-2.5 text-small font-semibold text-subtle"
                        >
                            <span role="columnheader">
                                {t('admin.overview.trend.colDate')}
                            </span>
                            <span role="columnheader">
                                {t('admin.overview.trend.thisPeriod')}
                            </span>
                            <span role="columnheader">
                                {t('admin.overview.trend.previousPeriod')}
                            </span>
                        </div>
                        {points.map((point, index) => (
                            <div
                                role="row"
                                key={point.date}
                                className={cn(
                                    'grid grid-cols-[1.2fr_1fr_1fr] gap-3 border-b border-line-soft px-4 py-2 text-control text-ink last:border-b-0',
                                )}
                            >
                                <span role="cell">{model.labels[index]}</span>
                                <span role="cell" className="font-bold">
                                    {point.current}
                                </span>
                                <span role="cell">{point.previous}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
