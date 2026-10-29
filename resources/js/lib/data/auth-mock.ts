import type { AuthSource, InvitationResult } from './auth';
import type { Role } from './types';

export const SAMPLE_PASSWORD = 'Sample-password-1';
export const SAMPLE_ACCOUNTS: Record<string, Role> = {
    'admin@sample.vocamed.test': 'clinic_admin',
    'reception@sample.vocamed.test': 'receptionist',
    'doctor@sample.vocamed.test': 'doctor',
};
export const SERVER_ERROR_EMAIL = 'error@sample.vocamed.test';
export const TAKEN_EMAIL = 'taken@sample.vocamed.test';

const INVITATIONS: Record<string, InvitationResult> = {
    'sample-receptionist': {
        state: 'valid',
        role: 'receptionist',
        clinicName: null,
    },
    'sample-doctor': { state: 'valid', role: 'doctor', clinicName: null },
    'sample-admin': { state: 'valid', role: 'clinic_admin', clinicName: null },
    'sample-used': { state: 'used' },
};

const THROTTLE_LIMIT = 5;
const THROTTLE_WINDOW_MS = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMockAuth(
    options: { latencyMs?: number; now?: () => number } = {},
): AuthSource {
    const { latencyMs = 0, now = () => Date.now() } = options;
    const failures = new Map<string, number[]>();

    async function call<T>(work: () => T): Promise<T> {
        if (latencyMs > 0) {
            await sleep(latencyMs);
        }

        return work();
    }

    const failOn = (email: string) => {
        if (email.trim().toLowerCase() === SERVER_ERROR_EMAIL) {
            throw new Error('Server error (sample)');
        }
    };

    const retryAfter = (list: number[]) =>
        Math.max(1, Math.ceil((list[0] + THROTTLE_WINDOW_MS - now()) / 1000));

    return {
        login: ({ email, password }) =>
            call(() => {
                const key = email.trim().toLowerCase();
                failOn(key);

                const recent = (failures.get(key) ?? []).filter(
                    (at) => now() - at < THROTTLE_WINDOW_MS,
                );

                if (recent.length >= THROTTLE_LIMIT) {
                    return {
                        ok: false as const,
                        reason: 'throttled' as const,
                        retryAfterSec: retryAfter(recent),
                    };
                }

                const role = SAMPLE_ACCOUNTS[key];

                if (role && password === SAMPLE_PASSWORD) {
                    failures.delete(key);

                    return { ok: true as const, role };
                }

                recent.push(now());
                failures.set(key, recent);

                return recent.length >= THROTTLE_LIMIT
                    ? {
                          ok: false as const,
                          reason: 'throttled' as const,
                          retryAfterSec: retryAfter(recent),
                      }
                    : { ok: false as const, reason: 'invalid' as const };
            }),

        requestPasswordReset: (email) =>
            call(() => {
                failOn(email);

                return { ok: true as const };
            }),

        checkResetToken: ({ token }) =>
            call(() => (token === 'sample-valid' ? 'valid' : 'expired')),

        resetPassword: ({ token }) =>
            call(() =>
                token === 'sample-valid'
                    ? { ok: true as const }
                    : { ok: false as const, reason: 'expired' as const },
            ),

        // Unknown tokens look exactly like expired ones, so a token's history is never revealed.
        getInvitation: (token) =>
            call(() => INVITATIONS[token] ?? { state: 'expired' as const }),

        acceptInvitation: ({ token }) =>
            call(() => {
                const invitation = INVITATIONS[token];

                if (invitation?.state === 'valid') {
                    return { ok: true as const };
                }

                return {
                    ok: false as const,
                    reason:
                        invitation?.state === 'used'
                            ? ('used' as const)
                            : ('expired' as const),
                };
            }),

        registerClinic: ({ email }) =>
            call(() => {
                failOn(email);

                return email.trim().toLowerCase() === TAKEN_EMAIL
                    ? {
                          ok: false as const,
                          errors: { email: 'taken' as const },
                      }
                    : { ok: true as const };
            }),

        requestDemo: () => call(() => ({ ok: true as const })),
    };
}
