import type { Locale } from '@/i18n/locales';
import { clockNow } from '@/lib/clock';
import {
    addDaysToDate,
    utcToZoned,
    type IsoDate,
    type IsoDateTime,
} from '@/lib/data';

/** Latin digits in both languages, as the design shows (11:30, not ١١:٣٠). */
const intlLocale = (locale: Locale) =>
    locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';

const utcNoon = (date: IsoDate) => {
    const [y, m, d] = date.split('-').map(Number);

    return new Date(Date.UTC(y, m - 1, d, 12));
};

/** Clinic-local calendar date of an instant. */
export const localDate = (iso: IsoDateTime, timeZone: string): IsoDate =>
    utcToZoned(new Date(iso), timeZone).date;

/** Today's calendar date in the clinic's timezone. */
export const todayIn = (timeZone: string, now = clockNow()): IsoDate =>
    utcToZoned(now, timeZone).date;

export function daysBetween(from: IsoDate, to: IsoDate): number {
    return Math.round(
        (utcNoon(to).getTime() - utcNoon(from).getTime()) / 86_400_000,
    );
}

/** "Saturday, 24 October" (add the year for calendar headers). */
export function formatLongDate(
    date: IsoDate,
    locale: Locale,
    withYear = false,
): string {
    const at = utcNoon(date);
    const weekday = new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        weekday: 'long',
    }).format(at);
    const rest = new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        ...(withYear ? { year: 'numeric' } : {}),
    }).format(at);

    // "Saturday, 24 October": the comma is written out because en-GB leaves it off.
    return `${weekday}${locale === 'ur' ? '،' : ','} ${rest}`;
}

export function formatMonthYear(date: IsoDate, locale: Locale): string {
    return new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        month: 'long',
        year: 'numeric',
    }).format(utcNoon(date));
}

/** "24 Oct" style short date. */
export function formatShortDate(date: IsoDate, locale: Locale): string {
    return new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
    }).format(utcNoon(date));
}

export function formatWeekdayShort(date: IsoDate, locale: Locale): string {
    return new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        weekday: 'short',
    }).format(utcNoon(date));
}

/** "22 Oct, 14:02": the compact stamp used in timelines and the notifications log. */
export function formatStamp(
    iso: IsoDateTime,
    timeZone: string,
    locale: Locale,
): string {
    const { date, time } = utcToZoned(new Date(iso), timeZone);

    return `${formatShortDate(date, locale)}, ${time}`;
}

/** Relative day phrase keys for `reception.day.*`, so callers translate with their own `t`. */
export function relativeDay(
    date: IsoDate,
    today: IsoDate,
): {
    key: 'today' | 'tomorrow' | 'yesterday' | 'inDays' | 'daysAgo';
    count: number;
} {
    const diff = daysBetween(today, date);

    if (diff === 0) {
        return { key: 'today', count: 0 };
    }

    if (diff === 1) {
        return { key: 'tomorrow', count: 1 };
    }

    if (diff === -1) {
        return { key: 'yesterday', count: 1 };
    }

    return diff > 0
        ? { key: 'inDays', count: diff }
        : { key: 'daysAgo', count: -diff };
}

/** Initials for the avatar: first letters of up to two words, in the name's own script. */
export function initialsOf(name: string): string {
    const words = name
        .replace(/^(dr\.?|ڈاکٹر)\s+/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return '?';
    }

    const letters = words.slice(0, 2).map((w) => Array.from(w)[0]);
    const arabic = /[؀-ۿ]/.test(name);

    return arabic ? letters.join(' ') : letters.join('').toUpperCase();
}

/**
 * Phone for display, in the clinic's national style (0333 1112233). Falls back to the stored
 * international form for other countries. Always render it inside a `dir="ltr"` element.
 */
export function formatPhone(e164: string, countryCode = '+92'): string {
    if (!e164) {
        return '';
    }

    if (!e164.startsWith(countryCode)) {
        return e164;
    }

    const national = `0${e164.slice(countryCode.length)}`;

    return national.length > 4
        ? `${national.slice(0, 4)} ${national.slice(4)}`
        : national;
}

/** Digits only, for matching what someone typed against stored numbers. */
export const digitsOf = (value: string) => value.replace(/\D/g, '');

export { addDaysToDate };
