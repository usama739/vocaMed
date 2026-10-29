import { meetsPasswordRule } from '@/lib/validation';
import type {
    AccountSource,
    AccountUser,
    AccountView,
    NotificationKey,
} from './account';
import type { MockDatabase } from './seed';
import { DataError, type Id } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_NAME = 120;
const TRIES_PER_MINUTE = 6;

type Person = {
    password: string;
    notifications: Record<NotificationKey, boolean>;
    otherSessions: number;
    tries: number[];
};

/**
 * The mock "server" for accounts. Each sample user has a password (the sample one to begin with),
 * three email choices and two other sessions, so a wrong current password really fails and signing
 * out other sessions has something to end. State lives for the page session, like the rest of the mock.
 */
export function createMockAccounts(
    db: MockDatabase,
    options: {
        latencyMs?: number;
        now?: () => Date;
        initialPassword: string;
        /** Called after a profile change so the shell can show the new name. */
        onChange?: () => void;
    },
): (userId: Id) => AccountSource {
    const latency = options.latencyMs ?? 0;
    const now = options.now ?? (() => new Date());
    const people = new Map<Id, Person>();

    const personOf = (userId: Id): Person => {
        let person = people.get(userId);

        if (!person) {
            person = {
                password: options.initialPassword,
                notifications: {
                    failedReminders: true,
                    patientCancellations: true,
                    dailySummary: false,
                },
                otherSessions: 2,
                tries: [],
            };
            people.set(userId, person);
        }

        return person;
    };

    async function respond<T>(work: () => T): Promise<T> {
        if (latency > 0) {
            await sleep(latency);
        }

        return structuredClone(work());
    }

    return (userId) => {
        const user = () => {
            const found = db.users.find((u) => u.id === userId);

            if (!found) {
                throw new DataError('NOT_FOUND', 'User not found');
            }

            return found;
        };
        const asUser = (): AccountUser => {
            const u = user();

            return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                locale: u.locale,
            };
        };

        /** Wrong passwords are counted; too many in a minute is refused. */
        function checkPassword(given: string, person: Person) {
            const t = now().getTime();
            person.tries = person.tries.filter((at) => t - at < 60_000);

            if (person.tries.length >= TRIES_PER_MINUTE) {
                throw new DataError(
                    'RATE_LIMITED',
                    'Too many tries. Try again in a minute.',
                );
            }

            if (given !== person.password) {
                person.tries.push(t);

                throw new DataError(
                    'INVALID_PASSWORD',
                    'That password is not right',
                    [],
                    'current',
                );
            }
        }

        return {
            views: {
                account: () =>
                    respond((): AccountView => {
                        const person = personOf(userId);

                        return {
                            user: asUser(),
                            notifications: { ...person.notifications },
                            otherSessions: person.otherSessions,
                        };
                    }),
            },

            saveProfile: (input) =>
                respond(() => {
                    const name = input.name.trim();

                    if (!name || name.length > MAX_NAME) {
                        throw new DataError(
                            'VALIDATION',
                            'Enter your name',
                            [],
                            'name',
                        );
                    }

                    const u = user();
                    u.name = name;
                    u.locale = input.locale;
                    options.onChange?.();

                    return asUser();
                }),

            changePassword: (input) =>
                respond(() => {
                    const person = personOf(userId);
                    checkPassword(input.current, person);

                    if (!meetsPasswordRule(input.password)) {
                        throw new DataError(
                            'VALIDATION',
                            'Choose a stronger password',
                            [],
                            'password',
                        );
                    }

                    if (input.password !== input.confirm) {
                        throw new DataError(
                            'VALIDATION',
                            'The passwords do not match',
                            [],
                            'confirm',
                        );
                    }

                    person.password = input.password;
                    // Changing the password signs the other devices out.
                    person.otherSessions = 0;
                }),

            setNotification: (key, on) =>
                respond(() => {
                    personOf(userId).notifications[key] = on;
                }),

            signOutOthers: (input) =>
                respond(() => {
                    const person = personOf(userId);
                    checkPassword(input.password, person);
                    const ended = person.otherSessions;
                    person.otherSessions = 0;

                    return { ended };
                }),
        };
    };
}
