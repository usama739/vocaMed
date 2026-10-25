export const LOCALES = ['en', 'ur'] as const;

export type Locale = (typeof LOCALES)[number];
export type Direction = 'ltr' | 'rtl';

export const DEFAULT_LOCALE: Locale = 'en';

export const DIRECTIONS: Record<Locale, Direction> = {
    en: 'ltr',
    ur: 'rtl',
};

/** Native names, shown in the language switch regardless of the active locale. */
export const LOCALE_NAMES: Record<Locale, string> = {
    en: 'English',
    ur: 'اردو',
};

export function isLocale(value: unknown): value is Locale {
    return (
        typeof value === 'string' &&
        (LOCALES as readonly string[]).includes(value)
    );
}

export function directionOf(locale: Locale): Direction {
    return DIRECTIONS[locale];
}
