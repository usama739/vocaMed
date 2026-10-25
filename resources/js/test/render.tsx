import { render, type RenderResult } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/i18n/locales';
import { resources } from '@/i18n';
import { LocaleScope } from '@/i18n/scope';

if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
        resources,
        lng: 'en',
        fallbackLng: 'en',
        defaultNS: 'translation',
        initAsync: false,
        interpolation: { escapeValue: false },
    });
}

/** Render inside a fixed-locale scope (lang and dir set), like the /components preview does. */
export function renderIn(
    locale: Locale,
    ui: ReactElement,
): RenderResult & { container: HTMLElement } {
    return render(<LocaleScope locale={locale}>{ui}</LocaleScope>);
}
