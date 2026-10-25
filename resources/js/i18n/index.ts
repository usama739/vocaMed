import { router } from '@inertiajs/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, directionOf, isLocale, type Locale } from './locales';
import en from './messages/en';
import ur from './messages/ur';

export const defaultNS = 'translation';
export const resources = {
    en: { translation: en },
    ur: { translation: ur },
} as const;

/** Mirrors the locale into <html lang dir> so CSS logical properties and fonts follow it. */
export function applyDocumentLocale(locale: Locale): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
}

function initialLocale(): Locale {
    const lang =
        typeof document === 'undefined'
            ? undefined
            : document.documentElement.lang;

    return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export function setupI18n(): typeof i18n {
    if (!i18n.isInitialized) {
        void i18n.use(initReactI18next).init({
            resources,
            lng: initialLocale(),
            fallbackLng: DEFAULT_LOCALE,
            defaultNS,
            // Resources are bundled, so load them synchronously: no first render of raw keys.
            initAsync: false,
            interpolation: { escapeValue: false },
            returnNull: false,
        });

        // The server owns the locale (cookie); follow it after every Inertia visit.
        router.on('navigate', (event) => {
            const locale = event.detail.page.props.locale;

            if (isLocale(locale) && locale !== i18n.language) {
                void i18n.changeLanguage(locale);
            }
        });

        i18n.on('languageChanged', (lng) => {
            if (isLocale(lng)) {
                applyDocumentLocale(lng);
            }
        });
    }

    return i18n;
}

export default i18n;
