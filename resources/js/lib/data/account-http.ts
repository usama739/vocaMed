import type {
    AccountSource,
    AccountUser,
    AccountView,
    NotificationKey,
} from './account';
import { sendJson, type HttpResult } from './http';
import { DataError } from './types';

const unexpected = (what: string, status: number) =>
    new Error(`Unexpected answer to ${what} (${status})`);

const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback;

/**
 * Turns the answers the Account page has a state for into the DataError it already handles (a wrong current password,
 * a refused field, too many tries), and anything else into a plain error, which the page shows as a retryable failure.
 */
function refusal(what: string, res: HttpResult): Error {
    const body = res.body;
    const message = text(body?.message, 'The request was refused');
    const field = typeof body?.field === 'string' ? body.field : null;

    if (res.status === 422 && body?.code === 'INVALID_PASSWORD') {
        return new DataError('INVALID_PASSWORD', message, [], field);
    }

    if (res.status === 422) {
        return new DataError('VALIDATION', message, [], field);
    }

    if (res.status === 429) {
        return new DataError('RATE_LIMITED', message);
    }

    if (res.status === 403) {
        return new DataError('FORBIDDEN', message);
    }

    return unexpected(what, res.status);
}

/**
 * The AccountSource backed by Laravel (`GET /account` as JSON, `PATCH /account`, `PUT /account/password`,
 * `PATCH /account/notifications`, `POST /account/sessions/logout-others`). `onChange` runs after the name or language
 * is saved, so whatever shows the signed-in person (the top bar) can refresh.
 */
export function createHttpAccount(
    options: { onChange?: () => void } = {},
    fetchImpl: typeof fetch = fetch,
): AccountSource {
    return {
        views: {
            async account(): Promise<AccountView> {
                const res = await sendJson(
                    'GET',
                    '/account',
                    undefined,
                    fetchImpl,
                );

                if (res.status !== 200 || !res.body?.user) {
                    throw refusal('account', res);
                }

                return res.body as unknown as AccountView;
            },
        },

        async saveProfile(input): Promise<AccountUser> {
            const res = await sendJson(
                'PATCH',
                '/account',
                { name: input.name, locale: input.locale },
                fetchImpl,
            );

            if (res.status !== 200 || !res.body) {
                throw refusal('profile save', res);
            }

            options.onChange?.();

            return res.body as unknown as AccountUser;
        },

        async changePassword(input): Promise<void> {
            const res = await sendJson(
                'PUT',
                '/account/password',
                {
                    current: input.current,
                    password: input.password,
                    confirm: input.confirm,
                },
                fetchImpl,
            );

            if (res.status !== 200) {
                throw refusal('password change', res);
            }
        },

        async setNotification(key: NotificationKey, on: boolean) {
            const res = await sendJson(
                'PATCH',
                '/account/notifications',
                { key, on },
                fetchImpl,
            );

            if (res.status !== 200) {
                throw refusal('email choice', res);
            }
        },

        async signOutOthers(input) {
            const res = await sendJson(
                'POST',
                '/account/sessions/logout-others',
                { password: input.password },
                fetchImpl,
            );

            if (res.status !== 200 || typeof res.body?.ended !== 'number') {
                throw refusal('sign out others', res);
            }

            return { ended: res.body.ended };
        },
    };
}
