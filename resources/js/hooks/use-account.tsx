import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { forcedStateFromUrl } from '@/components/reception/runtime';
import {
    getAccountSource,
    type AccountSource,
    type AccountView,
} from '@/lib/data';

const AccountContext = createContext<AccountSource>(
    getAccountSource('clinic_admin'),
);

/**
 * The Account page reads and saves through `useAccountSource()`, a source of its own for the signed-in
 * person, kept apart from the clinic's `DataSource`. Tests (and the real API client later) hand the page
 * a different source without touching it.
 */
export function AccountSourceProvider({
    source,
    children,
}: {
    source: AccountSource;
    children: ReactNode;
}) {
    return (
        <AccountContext.Provider value={source}>
            {children}
        </AccountContext.Provider>
    );
}

export const useAccountSource = (): AccountSource => useContext(AccountContext);

/**
 * Loads the account read model. With Inertia this becomes the page props; the page does not change.
 * `?state=loading|error` (local hosts only) forces that state for review and tests.
 */
export function useAccountView(): {
    data: AccountView | undefined;
    status: 'loading' | 'ready' | 'error';
    reload: () => void;
} {
    const source = useAccountSource();
    const forced = useMemo(
        () =>
            typeof window === 'undefined'
                ? null
                : forcedStateFromUrl(
                      window.location.search,
                      window.location.hostname,
                  ),
        [],
    );
    const [data, setData] = useState<AccountView | undefined>(undefined);
    const [failed, setFailed] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (forced === 'loading' || forced === 'error') {
            return;
        }

        let cancelled = false;
        source.views.account().then(
            (value) => {
                if (!cancelled) {
                    setData(value);
                    setFailed(false);
                }
            },
            () => {
                if (!cancelled) {
                    setFailed(true);
                }
            },
        );

        return () => {
            cancelled = true;
        };
    }, [source, version, forced]);

    const reload = useCallback(() => {
        setFailed(false);
        setVersion((v) => v + 1);
    }, []);

    return {
        data,
        status:
            forced === 'loading'
                ? 'loading'
                : forced === 'error' || failed
                  ? 'error'
                  : data === undefined
                    ? 'loading'
                    : 'ready',
        reload,
    };
}
