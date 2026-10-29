import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAccount } from './account-http';
import { DataError } from './types';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown = {}) {
    const calls: Call[] = [];
    const impl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });

        return Promise.resolve(
            new Response(body === null ? null : JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    }) as unknown as typeof fetch;

    return { impl, calls };
}

const sent = (call: Call) => JSON.parse(String(call.init.body));

const caught = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the call to fail');
};

afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const VIEW = {
    user: {
        id: '7',
        name: 'Dr Sana',
        email: 'sana@example.test',
        role: 'doctor',
        locale: 'en',
    },
    notifications: {
        failedReminders: true,
        patientCancellations: true,
        dailySummary: false,
    },
    otherSessions: 2,
};

describe('the real AccountSource', () => {
    it('reads the page from GET /account', async () => {
        const { impl, calls } = fakeFetch(200, VIEW);

        const view = await createHttpAccount({}, impl).views.account();

        expect(calls[0].url).toBe('/account');
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.headers).toMatchObject({
            Accept: 'application/json',
        });
        expect(view).toEqual(VIEW);
    });

    it('saves the name and language with PATCH /account, then tells the shell', async () => {
        const onChange = vi.fn();
        const { impl, calls } = fakeFetch(200, VIEW.user);

        const saved = await createHttpAccount({ onChange }, impl).saveProfile({
            name: 'Dr Sana Malik',
            locale: 'ur',
        });

        expect(calls[0].url).toBe('/account');
        expect(calls[0].init.method).toBe('PATCH');
        expect(sent(calls[0])).toEqual({ name: 'Dr Sana Malik', locale: 'ur' });
        expect(saved.name).toBe('Dr Sana');
        expect(onChange).toHaveBeenCalledOnce();
    });

    it('does not tell the shell when the save was refused', async () => {
        const onChange = vi.fn();
        const { impl } = fakeFetch(422, {
            code: 'VALIDATION',
            field: 'name',
            message: 'x',
        });

        const error = await caught(
            createHttpAccount({ onChange }, impl).saveProfile({
                name: '',
                locale: 'en',
            }),
        );

        expect(error).toBeInstanceOf(DataError);
        expect(error).toMatchObject({ code: 'VALIDATION', field: 'name' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('changes the password with PUT /account/password', async () => {
        const { impl, calls } = fakeFetch(200, { ok: true });

        await createHttpAccount({}, impl).changePassword({
            current: 'old-password-1',
            password: 'new-password-1',
            confirm: 'new-password-1',
        });

        expect(calls[0].url).toBe('/account/password');
        expect(calls[0].init.method).toBe('PUT');
        expect(sent(calls[0])).toEqual({
            current: 'old-password-1',
            password: 'new-password-1',
            confirm: 'new-password-1',
        });
    });

    it('reads a wrong current password as INVALID_PASSWORD on the current field', async () => {
        const { impl } = fakeFetch(422, {
            code: 'INVALID_PASSWORD',
            field: 'current',
            message: 'That password is not right.',
        });

        const error = await caught(
            createHttpAccount({}, impl).changePassword({
                current: 'x',
                password: 'new-password-1',
                confirm: 'new-password-1',
            }),
        );

        expect(error).toMatchObject({
            code: 'INVALID_PASSWORD',
            field: 'current',
        });
    });

    it('reads a refused new password as VALIDATION on its field', async () => {
        const { impl } = fakeFetch(422, {
            code: 'VALIDATION',
            field: 'confirm',
            message: 'x',
            errors: { confirm: ['x'] },
        });

        const error = await caught(
            createHttpAccount({}, impl).changePassword({
                current: 'x',
                password: 'a',
                confirm: 'b',
            }),
        );

        expect(error).toMatchObject({ code: 'VALIDATION', field: 'confirm' });
    });

    it('reads too many tries as RATE_LIMITED, and a forbidden answer as FORBIDDEN', async () => {
        const limited = await caught(
            createHttpAccount(
                {},
                fakeFetch(429, { code: 'RATE_LIMITED' }).impl,
            ).signOutOthers({ password: 'x' }),
        );
        const forbidden = await caught(
            createHttpAccount(
                {},
                fakeFetch(403, { code: 'FORBIDDEN' }).impl,
            ).views.account(),
        );

        expect(limited).toMatchObject({ code: 'RATE_LIMITED' });
        expect(forbidden).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('sends each email choice with PATCH /account/notifications', async () => {
        const { impl, calls } = fakeFetch(200, { ok: true });

        await createHttpAccount({}, impl).setNotification('dailySummary', true);

        expect(calls[0].url).toBe('/account/notifications');
        expect(calls[0].init.method).toBe('PATCH');
        expect(sent(calls[0])).toEqual({ key: 'dailySummary', on: true });
    });

    it('signs the other sessions out with POST and answers how many ended', async () => {
        const { impl, calls } = fakeFetch(200, { ended: 3 });

        const result = await createHttpAccount({}, impl).signOutOthers({
            password: 'current-password-1',
        });

        expect(calls[0].url).toBe('/account/sessions/logout-others');
        expect(calls[0].init.method).toBe('POST');
        expect(sent(calls[0])).toEqual({ password: 'current-password-1' });
        expect(result).toEqual({ ended: 3 });
    });

    it('rejects with a plain error on a server failure, so the page offers a retry', async () => {
        for (const status of [500, 419]) {
            const error = await caught(
                createHttpAccount({}, fakeFetch(status).impl).views.account(),
            );

            expect(error).toBeInstanceOf(Error);
            expect(error).not.toBeInstanceOf(DataError);
        }

        const odd = await caught(
            createHttpAccount({}, fakeFetch(404, {}).impl).views.account(),
        );

        expect(odd).not.toBeInstanceOf(DataError);
    });
});
