import {
    formatShortDate,
    formatWeekdayShort,
} from '@/components/reception/format';
import type { Locale } from '@/i18n/locales';
import type { AdminPeriod, IsoDate, TrendPoint } from '@/lib/data';

export type DeltaTone = 'good' | 'bad' | 'flat';

export interface KpiDelta {
    /** Percent change, or percentage points for a rate. */
    diff: number;
    direction: 'up' | 'down' | 'flat';
    tone: DeltaTone;
    points: boolean;
}

/**
 * How a number moved since the period before. A rate (a percentage) moves in points; a count moves
 * in percent. Whether up is good depends on the number: fewer cancellations is better. Returns null
 * when there is nothing to compare with (the period before had none).
 */
export function kpiDelta(
    value: number,
    previous: number,
    options: { points: boolean; lowerIsBetter?: boolean },
): KpiDelta | null {
    if (!options.points && previous === 0) {
        return value === 0
            ? { diff: 0, direction: 'flat', tone: 'flat', points: false }
            : null;
    }

    const diff = options.points
        ? Math.round((value - previous) * 10) / 10
        : Math.round(((value - previous) / previous) * 100);

    if (diff === 0) {
        return {
            diff,
            direction: 'flat',
            tone: 'flat',
            points: options.points,
        };
    }

    const up = diff > 0;

    return {
        diff,
        direction: up ? 'up' : 'down',
        tone: up !== !!options.lowerIsBetter ? 'good' : 'bad',
        points: options.points,
    };
}

/** "+12%", "−1.3 pts" (a real minus sign). */
export function formatDelta(delta: KpiDelta, pointsLabel: string): string {
    if (delta.diff === 0) {
        return '';
    }

    const sign = delta.diff > 0 ? '+' : '−';
    const size = Math.abs(delta.diff);

    return delta.points ? `${sign}${size} ${pointsLabel}` : `${sign}${size}%`;
}

export const formatCount = (value: number) => String(value);
export const formatPercent = (value: number) => `${value}%`;

/** The vertical scale of the trend chart: the top tick, rounded up to a multiple of 20. */
export function chartTop(points: TrendPoint[]): number {
    const highest = Math.max(
        1,
        ...points.map((p) => Math.max(p.current, p.previous)),
    );

    return Math.max(20, Math.ceil((highest * 1.05) / 20) * 20);
}

/** Position of a point on the 100 by 100 chart box. */
export const chartX = (index: number, count: number) =>
    ((index + 0.5) / count) * 100;
export const chartY = (value: number, top: number) => 100 - (value / top) * 100;

export function linePath(values: number[], top: number): string {
    return values
        .map(
            (value, index) =>
                `${index ? 'L' : 'M'}${chartX(index, values.length).toFixed(2)} ${chartY(value, top).toFixed(2)}`,
        )
        .join(' ');
}

export function areaPath(values: number[], top: number): string {
    if (values.length === 0) {
        return '';
    }

    return `${linePath(values, top)} L${chartX(values.length - 1, values.length).toFixed(2)} 100 L${chartX(0, values.length).toFixed(2)} 100 Z`;
}

/**
 * The label under each trend point: the weekday for a week, the day of the month for a month, the
 * date ("27 Jul") for the weekly points of three months.
 */
export function trendLabel(
    date: IsoDate,
    period: AdminPeriod,
    locale: Locale,
): string {
    if (period === 'last7') {
        return formatWeekdayShort(date, locale);
    }

    if (period === 'month') {
        return String(Number(date.slice(8, 10)));
    }

    return formatShortDate(date, locale);
}

/** Which points get a label on the horizontal axis (about seven). */
export function axisIndexes(count: number): number[] {
    const step = Math.max(1, Math.ceil(count / 7));

    return Array.from({ length: Math.ceil(count / step) }, (_, i) => i * step);
}
