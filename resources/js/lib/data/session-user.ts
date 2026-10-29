import type { SessionUser } from './account';
import type { MockDatabase } from './seed';
import type { Id, Role } from './types';

/**
 * The signed-in person as the shell shows them. A small store so that saving a new name on the
 * Account page changes the top bar everywhere at once. With Laravel the shared `auth.user` prop does
 * this job and the store goes away.
 */
export function createSessionUserStore(
    db: MockDatabase,
    sampleUsers: Record<Role, Id>,
) {
    const listeners = new Set<() => void>();
    const cache = new Map<Role, SessionUser>();

    return {
        get(role: Role): SessionUser {
            const found = db.users.find((u) => u.id === sampleUsers[role]);

            if (!found) {
                throw new Error(`No sample user for ${role}`);
            }

            const previous = cache.get(role);

            if (
                previous &&
                previous.name === found.name &&
                previous.email === found.email &&
                previous.locale === found.locale
            ) {
                return previous;
            }

            const next: SessionUser = {
                id: found.id,
                name: found.name,
                email: found.email,
                role: found.role,
                locale: found.locale,
            };
            cache.set(role, next);

            return next;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        notify() {
            listeners.forEach((listener) => listener());
        },
    };
}
