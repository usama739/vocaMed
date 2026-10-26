import { addDays, weekdayOf } from './time';
import type { IsoDate } from './types';
import type { CalendarMode } from './views';

/** Monday of the week that contains `date`. */
export function weekStart(date: IsoDate): IsoDate {
    const offset = (weekdayOf(date) + 6) % 7;

    return addDays(date, -offset);
}

export function monthStart(date: IsoDate): IsoDate {
    return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: IsoDate): IsoDate {
    const next = addDays(monthStart(date), 32).slice(0, 7);

    return addDays(`${next}-01`, -1);
}

/** The dates a calendar view covers: one day, the week, or the whole month. */
export function rangeOf(
    view: CalendarMode,
    date: IsoDate,
): { from: IsoDate; to: IsoDate } {
    if (view === 'day') {
        return { from: date, to: date };
    }

    if (view === 'week') {
        const from = weekStart(date);

        return { from, to: addDays(from, 6) };
    }

    return { from: monthStart(date), to: monthEnd(date) };
}
