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
            // Persisted server-side in a cookie so Blade renders the right <html dir> on first paint.
            router.post(
                '/locale',
                { locale: next },
                { preserveScroll: true, preserveState: true },
            );
        },
    };
}
