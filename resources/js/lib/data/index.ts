import { createMockDataSource, createMockPatientLinks } from './mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from './seed';
import type { DataSource, PatientLinkSource } from './source';

export * from './types';
export type { DataSource, PatientLinkSource } from './source';
export { SLOT_HOLD_SECONDS } from './mock';

/**
 * The swap point. Pages import `data` and `patientLinks` from here and nowhere else.
 * To move to the real API, build an implementation of DataSource / PatientLinkSource
 * that talks to Laravel and return it from these two functions.
 */
const database = createSeedDatabase();
const latencyMs = import.meta.env.MODE === 'test' ? 0 : 150;

export function getDataSource(
    clinicId: string = DEMO_CLINIC_ID,
    actorId: string = 'u_recep',
): DataSource {
    return createMockDataSource(database, { clinicId, actorId, latencyMs });
}

export const data: DataSource = getDataSource();

export const patientLinks: PatientLinkSource = createMockPatientLinks(
    database,
    { latencyMs },
);
