import type { AuthSource } from './auth';
import { clockNow } from '@/lib/clock';
import { createMockAuth } from './auth-mock';
import { createMockDataSource, createMockPatientLinks } from './mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from './seed';
import { startActivitySimulator } from './simulator';
import type { DataSource, PatientLinkSource } from './source';

export * from './types';
export * from './auth';
export { SAMPLE_ACCOUNTS, SAMPLE_PASSWORD } from './auth-mock';
export type { DataSource, PatientLinkSource } from './source';
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
    { latencyMs },
);

/** Sign-in, password recovery, invitations and sign-up. Mock until the endpoints exist. */
export const auth: AuthSource = createMockAuth({
    latencyMs: import.meta.env.MODE === 'test' ? 0 : 600,
});
