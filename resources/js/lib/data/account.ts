import type { Id, Locale, Role } from './types';

/**
 * Everything the Account page needs, kept apart from the clinic's `DataSource`: an account belongs
 * to the signed-in person, not to the clinic's data. It is backed by a mock until the Laravel
 * endpoints exist; then only `./index.ts` changes.
 */

export type NotificationKey =
    'failedReminders' | 'patientCancellations' | 'dailySummary';

export interface AccountUser {
    id: Id;
    name: string;
    /** Read only: the email is the sign-in. */
    email: string;
    role: Role;
    locale: Locale;
}

export interface AccountView {
    user: AccountUser;
    /** What reaches the person's email. In-app alerts always show. */
    notifications: Record<NotificationKey, boolean>;
    /** How many other sessions are signed in. */
    otherSessions: number;
}

export interface AccountSource {
    views: {
        /** `GET /account`. */
        account(): Promise<AccountView>;
    };
    /** `PATCH /account`: name (required, up to 120 characters) and language. Returns the saved user. */
    saveProfile(input: { name: string; locale: Locale }): Promise<AccountUser>;
    /**
     * `PUT /account/password`. A wrong current password answers INVALID_PASSWORD (field `current`); a
     * weak or mismatched new one answers VALIDATION (field `password` or `confirm`). Also ends the
     * other sessions.
     */
    changePassword(input: {
        current: string;
        password: string;
        confirm: string;
    }): Promise<void>;
    /** `PATCH /account/notifications`. */
    setNotification(key: NotificationKey, on: boolean): Promise<void>;
    /** `POST /account/sessions/logout-others`. Answers how many sessions were ended. */
    signOutOthers(input: { password: string }): Promise<{ ended: number }>;
}

/**
 * Who is signed in, for the shell and the Account page. With Laravel this is the `auth.user` prop
 * every page already receives; the demo reads the sample user of the area being shown.
 */
export type SessionUser = AccountUser;
