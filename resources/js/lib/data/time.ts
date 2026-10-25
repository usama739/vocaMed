import type { IsoDate, TimeOfDay } from './types';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
    let f = formatters.get(timeZone);

    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatters.set(timeZone, f);
    }

    return f;
}

function offsetMs(at: Date, timeZone: string): number {
    const parts = formatter(timeZone).formatToParts(at);
    const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second'),
    );

    return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Clinic-local wall time → UTC instant. */
export function zonedToUtc(
    date: IsoDate,
    time: TimeOfDay,
    timeZone: string,
): Date {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    const first = wall - offsetMs(new Date(wall), timeZone);
    const second = wall - offsetMs(new Date(first), timeZone);

    return new Date(second);
}

/** UTC instant → clinic-local calendar date, time and weekday. */
export function utcToZoned(
    at: Date,
    timeZone: string,
): { date: IsoDate; time: TimeOfDay; weekday: number } {
    const parts = formatter(timeZone).formatToParts(at);
    const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? '00';
    const date = `${get('year')}-${get('month')}-${get('day')}`;

    return {
        date,
        time: `${get('hour')}:${get('minute')}`,
        weekday: weekdayOf(date),
    };
}

export function weekdayOf(date: IsoDate): number {
    const [y, m, d] = date.split('-').map(Number);

    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: IsoDate, days: number): IsoDate {
    const [y, m, d] = date.split('-').map(Number);

    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMinutes(at: Date, minutes: number): Date {
    return new Date(at.getTime() + minutes * 60_000);
}
