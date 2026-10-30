import { sendJson, type HttpResult } from './http';
import type { DataSource } from './source';
import {
    DataError,
    type AvailabilityDraft,
    type AvailabilityPreview,
    type Doctor,
    type DoctorSaveInput,
    type Id,
    type Invitation,
    type Service,
    type ServiceInput,
    type SettingsDraft,
    type StaffInviteInput,
    type TemplateKey,
    type User,
    type DataErrorCode,
} from './types';
import type {
    AdminDoctorsParams,
    AdminDoctorsView,
    AdminDoctorView,
    AdminServicesView,
    AdminSettingsView,
    AdminStaffView,
    AdminTemplatesView,
    AuditParams,
    AuditView,
    AvailabilityView,
} from './views';

const KNOWN_CODES: ReadonlySet<string> = new Set<DataErrorCode>([
    'NOT_FOUND',
    'SLOT_UNAVAILABLE',
    'INVALID_TRANSITION',
    'VALIDATION',
    'INVALID_PHONE',
    'DUPLICATE_PHONE',
    'DUPLICATE_EMAIL',
    'DUPLICATE_NAME',
    'LAST_ADMIN',
    'UNKNOWN_VARIABLE',
    'LINK_EXPIRED',
    'OUTSIDE_WINDOW',
    'RATE_LIMITED',
    'INVALID_PASSWORD',
    'FORBIDDEN',
]);

/**
 * Turns an answer the screens have a state for into the DataError they already handle (code, field, detail), and anything
 * else into a plain error, which a page shows as a retryable failure.
 */
export function dataErrorFrom(what: string, res: HttpResult): Error {
    const body = res.body;
    const code = body?.code;

    if (typeof code === 'string' && KNOWN_CODES.has(code)) {
        return new DataError(
            code as DataErrorCode,
            typeof body?.message === 'string' ? body.message : code,
            [],
            typeof body?.field === 'string' ? body.field : null,
            typeof body?.detail === 'string' ? body.detail : null,
        );
    }

    if (res.status === 429) {
        return new DataError('RATE_LIMITED', 'Too many tries');
    }

    return new Error(`Unexpected answer to ${what} (${res.status})`);
}

const query = (params: Record<string, string | number | undefined>) => {
    const pairs = Object.entries(params).filter(
        ([, value]) => value !== undefined && value !== '',
    );

    return pairs.length === 0
        ? ''
        : `?${pairs
              .map(
                  ([key, value]) =>
                      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
              )
              .join('&')}`;
};

/**
 * The staff DataSource with the clinic-setup parts (admin pages D2 to D8 and the doctor's own availability) answered by
 * Laravel and everything else still answered by `mock`: reception, the doctor's schedule and the patient pages become real
 * in their own steps. Used only when real sign-in is on.
 */
export function createHttpSource(
    mock: DataSource,
    fetchImpl: typeof fetch = fetch,
): DataSource {
    const send = (
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        data?: Record<string, unknown>,
    ) => sendJson(method, url, data, fetchImpl);

    /** One request whose success carries a JSON body of the given shape. */
    async function call<T>(
        what: string,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        data?: Record<string, unknown>,
    ): Promise<T> {
        const res = await send(method, url, data);

        if (res.status >= 200 && res.status < 300 && res.body !== null) {
            return res.body as unknown as T;
        }

        throw dataErrorFrom(what, res);
    }

    async function done(
        what: string,
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        data?: Record<string, unknown>,
    ): Promise<void> {
        const res = await send(method, url, data);

        if (!(res.status >= 200 && res.status < 300)) {
            throw dataErrorFrom(what, res);
        }
    }

    const draftBody = (draft: AvailabilityDraft) =>
        draft as unknown as Record<string, unknown>;

    return {
        ...mock,

        views: {
            ...mock.views,

            adminDoctors: (params: AdminDoctorsParams) =>
                call<AdminDoctorsView>(
                    'doctors',
                    'GET',
                    `/admin/doctors${query({ q: params.q, status: params.status })}`,
                ),

            /** A doctor who does not exist (or belongs to another clinic) reads as `null`, the page's "not found". */
            adminDoctor: async ({
                doctorId,
            }): Promise<AdminDoctorView | null> => {
                const res = await send(
                    'GET',
                    `/admin/doctors/${encodeURIComponent(doctorId)}`,
                );

                if (res.status === 404) {
                    return null;
                }

                if (res.status === 200 && res.body) {
                    return res.body as unknown as AdminDoctorView;
                }

                throw dataErrorFrom('doctor', res);
            },

            adminStaff: () =>
                call<AdminStaffView>('staff', 'GET', '/admin/staff'),
            adminServices: () =>
                call<AdminServicesView>('services', 'GET', '/admin/services'),
            adminSettings: () =>
                call<AdminSettingsView>('settings', 'GET', '/admin/settings'),
            adminTemplates: () =>
                call<AdminTemplatesView>(
                    'templates',
                    'GET',
                    '/admin/templates',
                ),
            adminAudit: (params: AuditParams) =>
                call<AuditView>(
                    'audit log',
                    'GET',
                    `/admin/audit${query({ days: params.days, userId: params.userId, category: params.category, page: params.page })}`,
                ),

            /** The signed-in doctor's own availability. */
            availability: () =>
                call<AvailabilityView>(
                    'availability',
                    'GET',
                    '/doctor/availability',
                ),
        },

        doctors: {
            ...mock.doctors,

            create: (input: DoctorSaveInput) =>
                call<Doctor>(
                    'doctor create',
                    'POST',
                    '/admin/doctors',
                    input as unknown as Record<string, unknown>,
                ),
            save: (id: Id, input: DoctorSaveInput) =>
                call<Doctor>(
                    'doctor save',
                    'PUT',
                    `/admin/doctors/${encodeURIComponent(id)}`,
                    input as unknown as Record<string, unknown>,
                ),
            setActive: (id: Id, active: boolean) =>
                call<Doctor>(
                    'doctor switch',
                    'PATCH',
                    `/admin/doctors/${encodeURIComponent(id)}`,
                    { active },
                ),
            invite: (id: Id, email: string) =>
                call<Invitation>(
                    'doctor invite',
                    'POST',
                    `/admin/doctors/${encodeURIComponent(id)}/invite`,
                    { email },
                ),

            /** With a doctor id it is the admin saving that doctor's availability; without, a doctor saving their own. */
            saveAvailability: (draft: AvailabilityDraft, doctorId?: Id) =>
                done(
                    'availability save',
                    'PUT',
                    doctorId === undefined
                        ? '/doctor/availability'
                        : `/admin/doctors/${encodeURIComponent(doctorId)}/availability`,
                    draftBody(draft),
                ),
            previewAvailability: (
                draft: AvailabilityDraft,
                doctorId?: Id | 'new',
            ) =>
                call<AvailabilityPreview>(
                    'availability preview',
                    'POST',
                    doctorId === undefined
                        ? '/doctor/availability/preview'
                        : `/admin/doctors/${encodeURIComponent(doctorId)}/availability/preview`,
                    draftBody(draft),
                ),
        },

        staff: {
            invite: (input: StaffInviteInput) =>
                call<Invitation>(
                    'staff invite',
                    'POST',
                    '/admin/staff/invite',
                    { ...input },
                ),
            resend: (invitationId: Id) =>
                call<Invitation>(
                    'staff resend',
                    'POST',
                    `/admin/staff/${encodeURIComponent(invitationId)}/resend`,
                ),
            revoke: (invitationId: Id) =>
                done(
                    'staff revoke',
                    'DELETE',
                    `/admin/staff/${encodeURIComponent(invitationId)}/invite`,
                ),
            setActive: (userId: Id, active: boolean) =>
                call<User>(
                    'staff switch',
                    'PATCH',
                    `/admin/staff/${encodeURIComponent(userId)}/deactivate`,
                    { active },
                ),
        },

        services: {
            ...mock.services,

            create: (input: ServiceInput) =>
                call<Service>('service create', 'POST', '/admin/services', {
                    ...input,
                }),
            update: (id: Id, input: ServiceInput) =>
                call<Service>(
                    'service save',
                    'PUT',
                    `/admin/services/${encodeURIComponent(id)}`,
                    { ...input },
                ),
            setActive: (id: Id, active: boolean) =>
                call<Service>(
                    'service switch',
                    'PATCH',
                    `/admin/services/${encodeURIComponent(id)}`,
                    { active },
                ),
        },

        settings: {
            save: (draft: SettingsDraft) =>
                done(
                    'settings save',
                    'PUT',
                    '/admin/settings',
                    draft as unknown as Record<string, unknown>,
                ),
        },

        templates: {
            save: (key: TemplateKey, body: string) =>
                done('template save', 'PUT', '/admin/templates', {
                    ...key,
                    body,
                }),
            reset: (key: TemplateKey) =>
                done('template reset', 'DELETE', '/admin/templates', {
                    ...key,
                }),
            testSend: (key: TemplateKey, body: string, phone: string) =>
                call<{ sentTo: string }>(
                    'template test',
                    'POST',
                    '/admin/templates/test',
                    { ...key, body, phone },
                ),
        },
    };
}
