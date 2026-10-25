import { router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import {
    directionOf,
    isLocale,
    type Direction,
    type Locale,
} from '@/i18n/locales';

export function useLocale(): {
    locale: Locale;
    dir: Direction;
    isRtl: boolean;
    setLocale: (locale: Locale) => void;
} {
    const { i18n } = useTranslation();
    const locale: Locale = isLocale(i18n.language) ? i18n.language : 'en';
    const dir = directionOf(locale);

    return {
        locale,
        dir,
        isRtl: dir === 'rtl',
        setLocale: (next) => {
            // Switch at once, so the page never waits on the server to change language...
            void i18n.changeLanguage(next);

            // ...then persist it in a cookie so Blade renders the right <html dir> on first paint.
            router.post(
                '/locale',
                { locale: next },
                { preserveScroll: true, preserveState: true },
            );
        },
    };
}
