import { formatPhone } from '@/components/reception/format';
import type {
    AdminSettingsView,
    Id,
    IsoDate,
    Locale,
    SettingsDraft,
    TimeOfDay,
} from '@/lib/data';

/** Monday first, as the design lists the week. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export const OPEN_FROM = 6 * 60;
export const OPEN_TO = 22 * 60;
export const STEP = 30;

export const REMINDER_CHOICES = [48, 24, 12, 4, 2, 1];
export const CANCEL_CHOICES = [1, 2, 4, 24];
export const RETENTION_CHOICES = [0, 7, 30];

export const toMinutes = (time: TimeOfDay) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const fromMinutes = (minutes: number): TimeOfDay =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface HoursDay {
    weekday: number;
    on: boolean;
    open: TimeOfDay;
    close: TimeOfDay;
}

/** What the form edits: the read model in the shape of its controls. */
export interface SettingsForm {
    name: string;
    /** As shown and typed (national style); the server normalises it. */
    phone: string;
    address: string;
    timezone: string;
    defaultLocale: Locale;
    hours: HoursDay[];
    holidays: { date: IsoDate; name: string }[];
    reminders: number[];
    /** `null` is "No limit". */
    cancellationWindow: number | null;
    approval: boolean;
    voice: boolean;
    retention: number;
}

export const formOf = (view: AdminSettingsView): SettingsForm => {
    const { clinic, settings } = view;

    return {
        name: clinic.name,
        phone: formatPhone(clinic.phone, clinic.phoneCountryCode),
        address: clinic.address,
        timezone: clinic.timezone,
        defaultLocale: clinic.defaultLocale,
        hours: WEEK.map((weekday) => {
            const found = settings.businessHours.find(
                (h) => h.weekday === weekday,
            );

            return {
                weekday,
                on: !!found,
                open: found?.open ?? '09:00',
                close: found?.close ?? '17:00',
            };
        }),
        holidays: settings.holidays.map((h) => ({ ...h })),
        reminders: sortReminders(settings.reminderHoursBefore),
        cancellationWindow: settings.cancellationWindowHours,
        approval: settings.rescheduleRequiresApproval,
        voice: settings.voiceEnabled,
        retention: settings.voiceAudioRetentionDays,
    };
};

/** Longest lead time first. */
export const sortReminders = (hours: number[]) =>
    [...hours].sort((a, b) => b - a);

export const draftOf = (form: SettingsForm): SettingsDraft => ({
    clinic: {
        name: form.name,
        phone: form.phone,
        address: form.address,
        timezone: form.timezone,
        defaultLocale: form.defaultLocale,
    },
    settings: {
        businessHours: form.hours
            .filter((day) => day.on)
            .map((day) => ({
                weekday: day.weekday,
                open: day.open,
                close: day.close,
            })),
        holidays: form.holidays,
        reminderHoursBefore: form.reminders,
        cancellationWindowHours: form.cancellationWindow,
        rescheduleRequiresApproval: form.approval,
        voiceEnabled: form.voice,
        voiceAudioRetentionDays: form.retention,
    },
});

export const keyOf = (form: SettingsForm | null) => JSON.stringify(form);

/** Holidays still to come first (soonest first), then the past (most recent first). */
export const orderHolidays = (
    holidays: SettingsForm['holidays'],
    today: IsoDate,
) => {
    const byDate = (a: { date: string }, b: { date: string }) =>
        a.date.localeCompare(b.date);

    return [
        ...holidays.filter((h) => h.date >= today).sort(byDate),
        ...holidays.filter((h) => h.date < today).sort((a, b) => byDate(b, a)),
    ];
};

export type { Id };
