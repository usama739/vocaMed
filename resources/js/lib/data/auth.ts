import type { Role } from './types';

export type LoginResult =
    | { ok: true; role: Role }
    | { ok: false; reason: 'invalid' }
    | { ok: false; reason: 'throttled'; retryAfterSec: number };

export type InvitationResult =
    | { state: 'valid'; role: Role; clinicName: string | null }
    | { state: 'expired' }
    | { state: 'used' };

export type RegisterInput = {
    clinic: string;
    country: string;
    timezone: string;
    name: string;
    email: string;
    password: string;
};

/**
 * Everything the public and sign-in pages need from the server. Backed by a mock until the
 * Laravel endpoints exist (login, forgot/reset password, invitations, sign-up); then only
 * ./index.ts changes. Methods reject on a network or server failure, which the pages show
 * as a retryable error.
 */
export interface AuthSource {
    login(input: {
        email: string;
        password: string;
        remember: boolean;
    }): Promise<LoginResult>;
    /** Always succeeds, so the page never reveals whether an address has an account. */
    requestPasswordReset(email: string): Promise<{ ok: true }>;
    checkResetToken(token: string): Promise<'valid' | 'expired'>;
    resetPassword(input: {
        token: string;
        password: string;
    }): Promise<{ ok: true } | { ok: false; reason: 'expired' }>;
    getInvitation(token: string): Promise<InvitationResult>;
    acceptInvitation(input: {
        token: string;
        name: string;
        password: string;
    }): Promise<{ ok: true } | { ok: false; reason: 'expired' | 'used' }>;
    registerClinic(
        input: RegisterInput,
    ): Promise<{ ok: true } | { ok: false; errors: { email: 'taken' } }>;
    requestDemo(input: {
        name: string;
        clinic: string;
        contact: string;
    }): Promise<{ ok: true }>;
}
