import { router } from '@inertiajs/react';
import type { AuthSource } from './auth';
import { clockNow } from '@/lib/clock';
import type { AccountSource, SessionUser } from './account';
import { createHttpAccount } from './account-http';
import { createHttpAuth } from './auth-http';
import { createMockAuth, SAMPLE_PASSWORD } from './auth-mock';
import { createMockAccounts } from './mock-account';
import { createSessionUserStore } from './session-user';
import { createMockDataSource } from './mock';
import { createMockPatientLinks } from './mock-patient-links';
import { createSeedDatabase, DEMO_CLINIC_ID } from './seed';
import { startActivitySimulator } from './simulator';
import type { DataSource, PatientLinkSource } from './source';

export * from './types';
export * from './auth';
export { SAMPLE_ACCOUNTS, SAMPLE_PASSWORD } from './auth-mock';
export type { DataSource, PatientLinkSource } from './source';
export * from './views';
export * from './patient-views';
export * from './account';
export { rangeOf, weekStart, monthStart, monthEnd } from './calendar-range';
export { SLOT_HOLD_SECONDS } from './mock';
export {
    addDays as addDaysToDate,
    addMinutes,
    utcToZoned,
    weekdayOf,
    zonedToUtc,
} from './time';
export { DEMO_CLINIC_ID } from './seed';
export {
    STATUS_TRANSITIONS,
    PREVIOUS_STATUS,
    canMoveStatus,
    isOpenStatus,
} from './status';

/**
 * The swap point. Pages import `data` and `patientLinks` from here and nowhere else.
 * To move to the real API, build an implementation of DataSource / PatientLinkSource
 * that talks to Laravel and return it from these two functions.
 */
const database = createSeedDatabase(clockNow());
const latencyMs = import.meta.env.MODE === 'test' ? 0 : 150;

export function getDataSource(
    clinicId: string = DEMO_CLINIC_ID,
    actorId: string = 'u_recep',
): DataSource {
    return createMockDataSource(database, {
        clinicId,
        actorId,
        latencyMs,
        now: clockNow,
    });
}

export const data: DataSource = getDataSource();

/**
 * The data source for the area being shown. In the demo there is no session, so each role uses its
 * sample user; with the real backend the session decides and every role gets the same source.
 */
const SAMPLE_USERS: Record<Role, string> = {
    clinic_admin: 'u_admin',
    receptionist: 'u_recep',
    doctor: 'u_doc1',
};
const roleSources = new Map<Role, DataSource>();

export function getRoleDataSource(role: Role): DataSource {
    let source = roleSources.get(role);

    if (!source) {
        source = getDataSource(DEMO_CLINIC_ID, SAMPLE_USERS[role]);
        roleSources.set(role, source);
    }

    return source;
}

/** Live-looking activity for the demo data (messages advancing, other receptionists holding slots). */
export function startDemoActivity(
    options: { otherReceptionist?: boolean } = {},
) {
    return startActivitySimulator(database, {
        clinicId: DEMO_CLINIC_ID,
        now: clockNow,
        ...options,
    });
}

export const patientLinks: PatientLinkSource = createMockPatientLinks(
    database,
    { latencyMs, now: clockNow },
);

/**
 * Sign-in, password recovery, invitations and sign-up. The mock by default (the demo and the browser specs);
 * Laravel's endpoints when VITE_REAL_AUTH=true.
 */
const REAL_AUTH = import.meta.env.VITE_REAL_AUTH === 'true';

export const auth: AuthSource = REAL_AUTH
    ? createHttpAuth()
    : createMockAuth({
          latencyMs: import.meta.env.MODE === 'test' ? 0 : 600,
      });

/**
 * The signed-in person, and their account. In the demo each role signs in as its sample user; with
 * the real backend the session decides, `getSessionUser` is replaced by the shared `auth.user` prop,
 * and the account source talks to Laravel.
 */
const sessionUsers = createSessionUserStore(database, SAMPLE_USERS);
const accountFor = createMockAccounts(database, {
    latencyMs: import.meta.env.MODE === 'test' ? 0 : 200,
    now: clockNow,
    initialPassword: SAMPLE_PASSWORD,
    onChange: () => sessionUsers.notify(),
});
const accountSources = new Map<Role, AccountSource>();

// With Laravel the session decides whose account it is, so one source serves every role. After the name or language
// is saved, the shared `auth` prop is refreshed so the top bar shows the new name.
const httpAccount: AccountSource | null = REAL_AUTH
    ? createHttpAccount({ onChange: () => router.reload({ only: ['auth'] }) })
    : null;

export const getAccountSource = (role: Role): AccountSource => {
    if (httpAccount) {
        return httpAccount;
    }

    let source = accountSources.get(role);

    if (!source) {
        source = accountFor(SAMPLE_USERS[role]);
        accountSources.set(role, source);
    }

    return source;
};

export const getSessionUser = (role: Role): SessionUser =>
    sessionUsers.get(role);
export const subscribeSessionUser = sessionUsers.subscribe;
