export type CountryCode = 'PK' | 'AE' | 'SA' | 'GB' | 'OTHER';

/** Choosing a country pre-selects its timezone; "Other" leaves the choice open. */
export const COUNTRIES: { code: CountryCode; timezone: string | null }[] = [
    { code: 'PK', timezone: 'Asia/Karachi' },
    { code: 'AE', timezone: 'Asia/Dubai' },
    { code: 'SA', timezone: 'Asia/Riyadh' },
    { code: 'GB', timezone: 'Europe/London' },
    { code: 'OTHER', timezone: null },
];

export const TIMEZONES = [
    { id: 'Asia/Karachi', offset: 'UTC+5' },
    { id: 'Asia/Dubai', offset: 'UTC+4' },
    { id: 'Asia/Riyadh', offset: 'UTC+3' },
    { id: 'Europe/London', offset: 'UTC+0' },
] as const;

export const timezoneLabel = (tz: (typeof TIMEZONES)[number]) =>
    `${tz.id} (${tz.offset})`;
