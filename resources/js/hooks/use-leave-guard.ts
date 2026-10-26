import { router } from '@inertiajs/react';
import { useEffect } from 'react';

/**
 * Leaving a page with unsaved changes asks first, for in-app links (Inertia) and for closing or
 * reloading the tab. Nothing is asked while there is nothing to lose.
 */
export function useLeaveGuard(dirty: boolean, message: string) {
    useEffect(() => {
        if (!dirty) {
            return;
        }

        const stop = router.on('before', (event) => {
            if (!window.confirm(message)) {
                event.preventDefault();
            }
        });
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);

        return () => {
            stop();
            window.removeEventListener('beforeunload', warn);
        };
    }, [dirty, message]);
}
