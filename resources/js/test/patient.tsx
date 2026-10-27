import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PatientLinkProvider } from '@/hooks/use-patient-links';
import type { Locale } from '@/i18n/locales';
import { LocaleScope } from '@/i18n/scope';
import type { PatientLinkSource } from '@/lib/data';
import { createMockPatientLinks } from '@/lib/data/mock-patient-links';
import { createSeedDatabase, type MockDatabase } from '@/lib/data/seed';
import '@/test/render';

/** A patient link source over its own sample database, on the (frozen) test clock. */
export function patientSource(): {
    db: MockDatabase;
    links: PatientLinkSource;
} {
    const db = createSeedDatabase(new Date());

    return {
        db,
        links: createMockPatientLinks(db, { now: () => new Date() }),
    };
}

/** A patient page with its own link source. The token comes from the mocked `usePage`. */
export function renderPatient(
    ui: ReactElement,
    options: { locale?: Locale; links?: PatientLinkSource } = {},
): RenderResult & { links: PatientLinkSource } {
    const links = options.links ?? patientSource().links;
    const result = render(
        <LocaleScope locale={options.locale ?? 'en'}>
            <PatientLinkProvider source={links}>{ui}</PatientLinkProvider>
        </LocaleScope>,
    );

    return Object.assign(result, { links });
}
