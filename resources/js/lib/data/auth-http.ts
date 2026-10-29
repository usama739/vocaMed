import type { AuthSource, InvitationResult } from './auth';
import { sendJson } from './http';
import type { Role } from './types';

const ROLES: Role[] = ['clinic_admin', 'receptionist', 'doctor'];
const isRole = (value: unknown): value is Role =>
    typeof value === 'string' && (ROLES as string[]).includes(value);

const DEFAULT_RETRY_SEC = 60;

const unexpected = (what: string, status: number) =>
    new Error(`Unexpected answer to ${what} (${status})`);

const validationFields = (body: Record<string, unknown> | null): string[] =>
    body?.errors && typeof body.errors === 'object'
        ? Object.keys(body.errors)
        : [];

/**
 * The AuthSource backed by Laravel's session endpoints (Fortify's sign-in and password routes plus the
 * invitation, sign-up and demo-request routes in routes/web.php). Every method maps the answers a page has
 * a state for (wrong password, expired link, taken email) to its result, and rejects on anything else so
 * the page shows a retryable error.
 */
export function createHttpAuth(fetchImpl: typeof fetch = fetch): AuthSource {
    const send = (
        method: 'GET' | 'POST',
        url: string,
        data?: Record<string, unknown>,
    ) => sendJson(method, url, data, fetchImpl);

    return {
        async login({ email, password, remember }) {
            const res = await send('POST', '/login', {
                email,
                password,
                remember,
            });

            if (res.status === 200 && isRole(res.body?.role)) {
                return { ok: true, role: res.body.role };
            }

            if (res.status === 422) {
                return { ok: false, reason: 'invalid' };
            }

            if (res.status === 429) {
                const fromBody = Number(res.body?.retryAfter);

                return {
                    ok: false,
                    reason: 'throttled',
                    retryAfterSec:
                        res.retryAfterSec ??
                        (fromBody > 0 ? fromBody : DEFAULT_RETRY_SEC),
                };
            }

            throw unexpected('login', res.status);
        },

        // The page never learns whether the address has an account, so a refusal reads as success too.
        async requestPasswordReset(email) {
            const res = await send('POST', '/forgot-password', { email });

            if ([200, 422, 429].includes(res.status)) {
                return { ok: true };
            }

            throw unexpected('password reset request', res.status);
        },

        async checkResetToken({ token, email }) {
            const res = await send(
                'GET',
                `/reset-password/${encodeURIComponent(token)}/status?email=${encodeURIComponent(email)}`,
            );

            if (res.status === 200 && res.body?.state === 'valid') {
                return 'valid';
            }

            if (res.status === 200 && res.body?.state === 'expired') {
                return 'expired';
            }

            throw unexpected('reset link check', res.status);
        },

        async resetPassword({ token, email, password }) {
            const res = await send('POST', '/reset-password', {
                token,
                email,
                password,
                password_confirmation: password,
            });

            if (res.status === 200) {
                return { ok: true };
            }

            // A bad or used link fails on the email field; a password the server refuses is not an expired link.
            if (
                res.status === 422 &&
                validationFields(res.body).includes('email')
            ) {
                return { ok: false, reason: 'expired' };
            }

            throw unexpected('password reset', res.status);
        },

        async getInvitation(token): Promise<InvitationResult> {
            const res = await send(
                'GET',
                `/invitations/${encodeURIComponent(token)}`,
            );
            const state = res.body?.state;

            if (res.status === 200 && state === 'valid') {
                if (!isRole(res.body?.role)) {
                    throw unexpected('invitation lookup', res.status);
                }

                return {
                    state: 'valid',
                    role: res.body.role,
                    clinicName:
                        typeof res.body.clinicName === 'string'
                            ? res.body.clinicName
                            : null,
                };
            }

            if (
                res.status === 200 &&
                (state === 'expired' || state === 'used')
            ) {
                return { state };
            }

            throw unexpected('invitation lookup', res.status);
        },

        async acceptInvitation({ token, name, password }) {
            const res = await send(
                'POST',
                `/invitations/${encodeURIComponent(token)}/accept`,
                { name, password },
            );

            if (res.status === 200) {
                return { ok: true };
            }

            if (res.status === 410) {
                return {
                    ok: false,
                    reason:
                        res.body?.code === 'INVITATION_USED'
                            ? 'used'
                            : 'expired',
                };
            }

            throw unexpected('invitation accept', res.status);
        },

        async registerClinic(input) {
            const res = await send('POST', '/register', { ...input });

            if (res.status === 200) {
                return { ok: true };
            }

            if (
                res.status === 422 &&
                validationFields(res.body).includes('email')
            ) {
                return { ok: false, errors: { email: 'taken' } };
            }

            throw unexpected('sign-up', res.status);
        },

        async requestDemo(input) {
            const res = await send('POST', '/demo-requests', { ...input });

            if (res.status === 200) {
                return { ok: true };
            }

            throw unexpected('demo request', res.status);
        },
    };
}
