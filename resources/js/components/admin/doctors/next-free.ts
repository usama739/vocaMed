import { localDate } from '@/components/reception/format';
import { formatClock, formatWhen } from '@/components/vocamed/booking/format';
import type { Locale } from '@/i18n/locales';
import type { IsoDate, Slot } from '@/lib/data';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * "Today, 15:30", "Tomorrow, 09:00" or "Mon, 2 Nov, 11:15" for the next free slot; "—" when there
 * is none (an inactive doctor, or one with no working hours). The caller wraps it in `dir="ltr"`.
 */
export function nextFreeLabel(
    slot: Slot | null,
    today: IsoDate,
    timeZone: string,
    locale: Locale,
    t: Translate,
): string {
    if (!slot) {
        return t('admin.doctors.none');
    }

    const day = localDate(slot.startsAt, timeZone);
    const time = formatClock(slot.startsAt, timeZone);
    const next = new Date(`${today}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);

    if (day === today) {
        return t('admin.doctors.today', { time });
    }

    if (day === next.toISOString().slice(0, 10)) {
        return t('admin.doctors.tomorrow', { time });
    }

    return formatWhen(slot.startsAt, timeZone, locale);
}
