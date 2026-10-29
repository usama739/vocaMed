import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DEFAULT_LOCALE,
    directionOf,
    isLocale,
    type Direction,
    type Locale,
} from './locales';

const LocaleScopeContext = createContext<Locale | null>(null);

/**
 * Renders its children in a fixed locale with the matching `lang` and `dir`, whatever the
 * page language is. Used by the /components preview to show English and Urdu side by side.
 * Everything inside translates through `useT`, so it follows the scope.
 */
export function LocaleScope({
    locale,
    className,
    children,
}: {
    locale: Locale;
    className?: string;
    children: ReactNode;
}) {
    return (
        <LocaleScopeContext.Provider value={locale}>
            <div lang={locale} dir={directionOf(locale)} className={className}>
                {children}
            </div>
        </LocaleScopeContext.Provider>
    );
}

/** `t` bound to the scoped locale (or the page locale outside any scope). */
/**
 * Keys under `reception.`, `doctor.` and `admin.` are checked by parity (Urdu must define every English key) and by tests,
 * but not by the compiler: typing several hundred more keys made the whole-project type check
 * many times slower. The loose overload comes first, so those calls skip the heavy key types.
 */
type ReceptionT = (
    key:
        | `reception.${string}`
        | `doctor.${string}`
        | `admin.${string}`
        | `patient.${string}`
        | `account.${string}`,
    options?: Record<string, unknown>,
) => string;
type TypedT = ReturnType<
    ReturnType<typeof useTranslation>['i18n']['getFixedT']
>;

export function useT(): {
    t: ReceptionT & TypedT;
    locale: Locale;
    dir: Direction;
    isRtl: boolean;
} {
    const scoped = useContext(LocaleScopeContext);
    const { i18n } = useTranslation();
    const locale: Locale =
        scoped ?? (isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE);
    const t = useMemo(
        () => i18n.getFixedT(locale) as unknown as ReceptionT & TypedT,
        [i18n, locale],
    );
    const dir = directionOf(locale);

    return { t, locale, dir, isRtl: dir === 'rtl' };
}
