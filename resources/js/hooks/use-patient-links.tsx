import { createContext, useContext, type ReactNode } from 'react';
import { patientLinks, type PatientLinkSource } from '@/lib/data';

const PatientLinkContext = createContext<PatientLinkSource>(patientLinks);

/**
 * Patient pages read and act through `usePatientLinks()`, a source of their own that is kept apart
 * from the staff `DataSource`: a signed link opens one appointment and nothing else. Tests (and the
 * real API client later) hand a page a different source without touching it.
 */
export function PatientLinkProvider({
    source,
    children,
}: {
    source: PatientLinkSource;
    children: ReactNode;
}) {
    return (
        <PatientLinkContext.Provider value={source}>
            {children}
        </PatientLinkContext.Provider>
    );
}

export const usePatientLinks = (): PatientLinkSource =>
    useContext(PatientLinkContext);
