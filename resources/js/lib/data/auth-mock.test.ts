// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    createMockAuth,
    SAMPLE_PASSWORD,
    SERVER_ERROR_EMAIL,
    TAKEN_EMAIL,
} from './auth-mock';

describe('mock auth', () => {
    it('signs each sample account in and reports its role', async () => {
        const auth = createMockAuth();

        for (const [email, role] of [
            ['admin@sample.vocamed.test', 'clinic_admin'],
            ['reception@sample.vocamed.test', 'receptionist'],
            ['doctor@sample.vocamed.test', 'doctor'],
        ] as const) {
            expect(
                await auth.login({
                    email: email.toUpperCase(),
                    password: SAMPLE_PASSWORD,
                    remember: false,
                }),
            ).toEqual({ ok: true, role });
        }
    });

    it('rejects a wrong password, then throttles on the fifth failure', async () => {
        let clock = 0;
        const auth = createMockAuth({ now: () => clock });
        const attempt = () =>
            auth.login({
                email: 'admin@sample.vocamed.test',
                password: 'nope',
                remember: false,
            });

        for (let i = 0; i < 4; i++) {
            expect(await attempt()).toEqual({ ok: false, reason: 'invalid' });
            clock += 1000;
        }

        expect(await attempt()).toMatchObject({
            ok: false,
            reason: 'throttled',
        });

        // Even the right password is refused while throttled, then works after the window.
        const right = () =>
            auth.login({
                email: 'admin@sample.vocamed.test',
                password: SAMPLE_PASSWORD,
                remember: false,
            });
        expect(await right()).toMatchObject({ reason: 'throttled' });
        clock += 61_000;
        expect(await right()).toMatchObject({ ok: true });
    });

    it('fails like a server error for the sample error address', async () => {
        const auth = createMockAuth();

        await expect(
            auth.login({
                email: SERVER_ERROR_EMAIL,
                password: 'x',
                remember: false,
            }),
        ).rejects.toThrow();
        await expect(
            auth.requestPasswordReset(SERVER_ERROR_EMAIL),
        ).rejects.toThrow();
    });

    it('always accepts a reset request, whoever asks', async () => {
        const auth = createMockAuth();

        expect(await auth.requestPasswordReset('nobody@example.com')).toEqual({
            ok: true,
        });
    });

    it('treats unknown reset tokens as expired', async () => {
        const auth = createMockAuth();

        expect(await auth.checkResetToken('sample-valid')).toBe('valid');
        expect(await auth.checkResetToken('sample-expired')).toBe('expired');
        expect(await auth.checkResetToken('whatever')).toBe('expired');
        expect(
            await auth.resetPassword({ token: 'whatever', password: 'x' }),
        ).toEqual({ ok: false, reason: 'expired' });
    });

    it('knows the invitation states and never reveals an unknown token', async () => {
        const auth = createMockAuth();

        expect(await auth.getInvitation('sample-doctor')).toMatchObject({
            state: 'valid',
            role: 'doctor',
        });
        expect(await auth.getInvitation('sample-used')).toEqual({
            state: 'used',
        });
        expect(await auth.getInvitation('sample-expired')).toEqual({
            state: 'expired',
        });
        expect(await auth.getInvitation('random-token')).toEqual({
            state: 'expired',
        });
        expect(
            await auth.acceptInvitation({
                token: 'sample-used',
                name: 'A',
                password: 'x',
            }),
        ).toEqual({ ok: false, reason: 'used' });
    });

    it('refuses sign-up for an address that is already in use', async () => {
        const auth = createMockAuth();
        const input = {
            clinic: 'C',
            country: 'PK',
            timezone: 'Asia/Karachi',
            name: 'N',
            password: 'x',
        };

        expect(
            await auth.registerClinic({ ...input, email: TAKEN_EMAIL }),
        ).toEqual({ ok: false, errors: { email: 'taken' } });
        expect(
            await auth.registerClinic({ ...input, email: 'new@example.com' }),
        ).toEqual({ ok: true });
    });
});
