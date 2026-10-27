import type { AuthSource } from './auth';
import { clockNow } from '@/lib/clock';
import { createMockAuth } from './auth-mock';
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

/** Sign-in, password recovery, invitations and sign-up. Mock until the endpoints exist. */
export const auth: AuthSource = createMockAuth({
    latencyMs: import.meta.env.MODE === 'test' ? 0 : 600,
});
