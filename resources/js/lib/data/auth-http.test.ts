import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAuth } from './auth-http';

type Call = { url: string; init: RequestInit };

/** A fetch that answers with the given status, JSON body and headers, and remembers what it was asked. */
function fakeFetch(
    status: number,
    body: unknown = {},
    headers: Record<string, string> = {},
) {
    const calls: Call[] = [];
    const impl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });

        return Promise.resolve(
            new Response(body === null ? null : JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json', ...headers },
            }),
        );
    }) as unknown as typeof fetch;

    return { impl, calls };
}

const sent = (call: Call) => JSON.parse(String(call.init.body));

afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('the real AuthSource: requests', () => {
    it('sends JSON with the session cookie and the CSRF token Laravel handed out', async () => {
        document.cookie = `XSRF-TOKEN=${encodeURIComponent('abc=/+')}`;
        const { impl, calls } = fakeFetch(200, { role: 'doctor' });

        await createHttpAuth(impl).login({
            email: 'a@b.test',
            password: 'pw',
            remember: true,
        });

        expect(calls[0].url).toBe('/login');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.credentials).toBe('same-origin');
        expect(calls[0].init.headers).toMatchObject({
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': 'abc=/+',
        });
        expect(sent(calls[0])).toEqual({
            email: 'a@b.test',
            password: 'pw',
            remember: true,
        });
    });

    it('rejects on a server error or an expired CSRF token, so the page offers a retry', async () => {
        for (const status of [500, 503, 419]) {
            await expect(
                createHttpAuth(fakeFetch(status).impl).login({
                    email: 'a@b.test',
                    password: 'pw',
                    remember: false,
                }),
            ).rejects.toThrow();
        }
    });

    it('rejects when the network fails', async () => {
        const impl = vi.fn(() =>
            Promise.reject(new TypeError('Failed to fetch')),
        ) as unknown as typeof fetch;

        await expect(
            createHttpAuth(impl).requestPasswordReset('a@b.test'),
        ).rejects.toThrow('Failed to fetch');
    });
});

describe('the real AuthSource: sign-in', () => {
    const credentials = {
        email: 'a@b.test',
        password: 'pw',
        remember: false,
    };

    it('returns the role the server signed the person in as', async () => {
        const { impl } = fakeFetch(200, {
            ok: true,
            role: 'receptionist',
            home: '/reception',
        });

        expect(await createHttpAuth(impl).login(credentials)).toEqual({
            ok: true,
            role: 'receptionist',
        });
    });

    it('treats a refusal as an invalid sign-in', async () => {
        const { impl } = fakeFetch(422, { code: 'VALIDATION', field: 'email' });

        expect(await createHttpAuth(impl).login(credentials)).toEqual({
            ok: false,
            reason: 'invalid',
        });
    });

    it('counts down from the Retry-After header when throttled', async () => {
        const { impl } = fakeFetch(
            429,
            { code: 'RATE_LIMITED', retryAfter: 30 },
            { 'Retry-After': '42' },
        );

        expect(await createHttpAuth(impl).login(credentials)).toEqual({
            ok: false,
            reason: 'throttled',
            retryAfterSec: 42,
        });
    });

    it('falls back to the body, then to a minute, when there is no header', async () => {
        expect(
            await createHttpAuth(fakeFetch(429, { retryAfter: 17 }).impl).login(
                credentials,
            ),
        ).toMatchObject({ retryAfterSec: 17 });
        expect(
            await createHttpAuth(fakeFetch(429, {}).impl).login(credentials),
        ).toMatchObject({ retryAfterSec: 60 });
    });

    it('does not trust a role it does not know', async () => {
        await expect(
            createHttpAuth(fakeFetch(200, { role: 'superuser' }).impl).login(
                credentials,
            ),
        ).rejects.toThrow();
    });
});

describe('the real AuthSource: password recovery', () => {
    it('always reports success for a reset request, whatever the server says about the address', async () => {
        for (const status of [200, 422, 429]) {
            expect(
                await createHttpAuth(
                    fakeFetch(status, {}).impl,
                ).requestPasswordReset('a@b.test'),
            ).toEqual({ ok: true });
        }
    });

    it('asks whether a link still works, with its token and address', async () => {
        const { impl, calls } = fakeFetch(200, { state: 'valid' });

        expect(
            await createHttpAuth(impl).checkResetToken({
                token: 'tok/en',
                email: 'a+b@c.test',
            }),
        ).toBe('valid');
        expect(calls[0].url).toBe(
            '/reset-password/tok%2Fen/status?email=a%2Bb%40c.test',
        );
        expect(calls[0].init.method).toBe('GET');
        expect(calls[0].init.body).toBeUndefined();
    });

    it('reports an expired link', async () => {
        const { impl } = fakeFetch(200, { state: 'expired' });

        expect(
            await createHttpAuth(impl).checkResetToken({
                token: 't',
                email: 'a@b.test',
            }),
        ).toBe('expired');
    });

    it('resets with the confirmation the server expects', async () => {
        const { impl, calls } = fakeFetch(200, { ok: true });

        expect(
            await createHttpAuth(impl).resetPassword({
                token: 't',
                email: 'a@b.test',
                password: 'a-new-password-1',
            }),
        ).toEqual({ ok: true });
        expect(calls[0].url).toBe('/reset-password');
        expect(sent(calls[0])).toEqual({
            token: 't',
            email: 'a@b.test',
            password: 'a-new-password-1',
            password_confirmation: 'a-new-password-1',
        });
    });

    it('reads a bad link as expired, but a refused password as a failure to retry', async () => {
        const input = {
            token: 't',
            email: 'a@b.test',
            password: 'a-new-password-1',
        };

        expect(
            await createHttpAuth(
                fakeFetch(422, { errors: { email: ['invalid token'] } }).impl,
            ).resetPassword(input),
        ).toEqual({ ok: false, reason: 'expired' });
        await expect(
            createHttpAuth(
                fakeFetch(422, { errors: { password: ['too weak'] } }).impl,
            ).resetPassword(input),
        ).rejects.toThrow();
    });
});

describe('the real AuthSource: invitations', () => {
    it('returns the role and clinic of a live invitation', async () => {
        const { impl, calls } = fakeFetch(200, {
            state: 'valid',
            role: 'doctor',
            clinicName: 'Shifa Clinic',
        });

        expect(await createHttpAuth(impl).getInvitation('abc')).toEqual({
            state: 'valid',
            role: 'doctor',
            clinicName: 'Shifa Clinic',
        });
        expect(calls[0].url).toBe('/invitations/abc');
    });

    it('returns expired and used as they are', async () => {
        expect(
            await createHttpAuth(
                fakeFetch(200, { state: 'expired' }).impl,
            ).getInvitation('abc'),
        ).toEqual({ state: 'expired' });
        expect(
            await createHttpAuth(
                fakeFetch(200, { state: 'used' }).impl,
            ).getInvitation('abc'),
        ).toEqual({ state: 'used' });
    });

    it('accepts, and says why a link failed', async () => {
        const input = { token: 'abc', name: 'Sana', password: 'a-good-pass-1' };

        expect(
            await createHttpAuth(
                fakeFetch(200, { ok: true }).impl,
            ).acceptInvitation(input),
        ).toEqual({ ok: true });
        expect(
            await createHttpAuth(
                fakeFetch(410, { code: 'INVITATION_USED' }).impl,
            ).acceptInvitation(input),
        ).toEqual({ ok: false, reason: 'used' });
        expect(
            await createHttpAuth(
                fakeFetch(410, { code: 'INVITATION_EXPIRED' }).impl,
            ).acceptInvitation(input),
        ).toEqual({ ok: false, reason: 'expired' });
    });

    it('sends only what the server needs to accept', async () => {
        const { impl, calls } = fakeFetch(200, { ok: true });

        await createHttpAuth(impl).acceptInvitation({
            token: 'a b',
            name: 'Sana',
            password: 'a-good-pass-1',
        });

        expect(calls[0].url).toBe('/invitations/a%20b/accept');
        expect(sent(calls[0])).toEqual({
            name: 'Sana',
            password: 'a-good-pass-1',
        });
    });
});

describe('the real AuthSource: sign-up and demo requests', () => {
    const clinic = {
        clinic: 'Shifa',
        country: 'PK',
        timezone: 'Asia/Karachi',
        name: 'Ayesha',
        email: 'a@b.test',
        password: 'a-good-pass-1',
    };

    it('signs up', async () => {
        const { impl, calls } = fakeFetch(200, { ok: true });

        expect(await createHttpAuth(impl).registerClinic(clinic)).toEqual({
            ok: true,
        });
        expect(calls[0].url).toBe('/register');
        expect(sent(calls[0])).toEqual(clinic);
    });

    it('reports a taken address on the email field, and anything else as a failure', async () => {
        expect(
            await createHttpAuth(
                fakeFetch(422, { errors: { email: ['taken'] } }).impl,
            ).registerClinic(clinic),
        ).toEqual({ ok: false, errors: { email: 'taken' } });
        await expect(
            createHttpAuth(
                fakeFetch(422, { errors: { timezone: ['bad'] } }).impl,
            ).registerClinic(clinic),
        ).rejects.toThrow();
        await expect(
            createHttpAuth(fakeFetch(404, {}).impl).registerClinic(clinic),
        ).rejects.toThrow();
    });

    it('sends a demo request, and fails loudly when it is refused', async () => {
        const input = { name: 'Dr Ali', clinic: 'Noor', contact: '0300' };
        const { impl, calls } = fakeFetch(200, { ok: true });

        expect(await createHttpAuth(impl).requestDemo(input)).toEqual({
            ok: true,
        });
        expect(calls[0].url).toBe('/demo-requests');
        expect(sent(calls[0])).toEqual(input);
        await expect(
            createHttpAuth(fakeFetch(429, {}).impl).requestDemo(input),
        ).rejects.toThrow();
    });
});
