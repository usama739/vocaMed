import { createContext, useContext, type ReactNode } from 'react';
import { data, type DataSource } from '@/lib/data';

const DataContext = createContext<DataSource>(data);

/**
 * Pages read data through `useData()` instead of importing the singleton, so tests (and later
 * the real API client) can hand a page a different source without touching the page.
 */
export function DataSourceProvider({
    source,
    children,
}: {
    source: DataSource;
    children: ReactNode;
}) {
    return (
        <DataContext.Provider value={source}>{children}</DataContext.Provider>
    );
}

export function useData(): DataSource {
    return useContext(DataContext);
}
