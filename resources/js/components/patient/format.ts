import { formatClock } from '@/components/vocamed/booking/format';
import type { Locale } from '@/i18n/locales';
import type { IsoDateTime } from '@/lib/data';

/** Latin digits in both languages, as everywhere else. */
const intlLocale = (locale: Locale) =>
    locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';

/** "Sat 24 October, 10:30" in the clinic's timezone. */
export function visitWhen(
    iso: IsoDateTime,
    timeZone: string,
    locale: Locale,
): string {
    const day = new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'long',
    }).format(new Date(iso));

    return `${day}, ${formatClock(iso, timeZone)}`;
}

/** The weekday written out: "Saturday". */
export const visitWeekday = (
    iso: IsoDateTime,
    timeZone: string,
    locale: Locale,
): string =>
    new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone,
        weekday: 'long',
    }).format(new Date(iso));

/** The phone number the way the clinic's country writes it (0213 5001122). */
export function nationalPhone(e164: string): string {
    if (!e164.startsWith('+92')) {
        return e164;
    }

    const national = `0${e164.slice(3)}`;

    return `${national.slice(0, 4)} ${national.slice(4)}`;
}

/** A maps search for the address; opened with no referrer, so the link's token never leaves the page. */
export const mapsHref = (address: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
