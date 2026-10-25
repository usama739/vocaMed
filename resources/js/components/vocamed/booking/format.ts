import type { Locale } from '@/i18n/locales';
import type { IsoDate, IsoDateTime } from '@/lib/data';

/** Latin digits in both languages, as the design shows (11:30, not ١١:٣٠). */
const intlLocale = (locale: Locale) =>
    locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';

export function formatClock(iso: IsoDateTime, timeZone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(iso));
}

/** Weekday and date of a clinic-local calendar date, e.g. "Tue, 27 Oct". */
export function formatDay(date: IsoDate, locale: Locale): string {
    const [y, m, d] = date.split('-').map(Number);

    return new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Weekday, date and time of an instant in the clinic's timezone. */
export function formatWhen(
    iso: IsoDateTime,
    timeZone: string,
    locale: Locale,
): string {
    const day = new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(new Date(iso));

    return `${day}, ${formatClock(iso, timeZone)}`;
}

export function formatCountdown(seconds: number): string {
    const s = Math.max(0, seconds);

    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
