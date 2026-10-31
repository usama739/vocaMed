import { sendJson, type HttpResult } from './http';
import type { DataSource } from './source';
import {
    DataError,
    type Appointment,
    type AppointmentQuery,
    type AppointmentStatus,
    type AvailabilityDraft,
    type AvailabilityPreview,
    type Clinic,
    type ClinicSettings,
    type Doctor,
    type DoctorAvailability,
    type DoctorSaveInput,
    type Id,
    type Invitation,
    type IsoDate,
    type IsoDateTime,
    type NewAppointmentInput,
    type NewPatientInput,
    type Page,
    type Patient,
    type PatientPatch,
    type RequestDecisionInput,
    type RescheduleRequest,
    type Service,
    type ServiceInput,
    type SettingsDraft,
    type Slot,
    type SlotHold,
    type SlotQuery,
    type StaffInviteInput,
    type TemplateKey,
    type TimelineItem,
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
    AppointmentDetailView,
    AppointmentsParams,
    AppointmentsView,
    AuditParams,
    AuditView,
    AvailabilityView,
    CalendarParams,
    CalendarViewData,
    DoctorOverviewView,
    DoctorScheduleParams,
    DoctorShellView,
    PatientDetailView,
    PatientsView,
    RequestsView,
    TodayView,
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
            // A taken slot comes with the nearest free ones, for the "Next free" chips.
            Array.isArray(body?.alternatives)
                ? (body.alternatives as Slot[])
                : [],
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
 * Laravel and everything else still answered by `mock`. With `desk` (the receptionist's console) the whole front desk is
 * Laravel's as well: the six reception pages, the booking panel, patients, slots, appointments and the clinic's doctors and
 * services. They switch together because the sample appointments point at sample patients, so mixing them would break
 * booking. With `doctor` the doctor's own Overview, Schedule, Requests and sidebar badge, and the status moves they make, are
 * Laravel's too, with their answer to a patient's reschedule request. The notifications stay on `mock` until their step.
 * Used only when real sign-in is on.
 */
export function createHttpSource(
    mock: DataSource,
    fetchImpl: typeof fetch = fetch,
    options: { desk?: boolean; doctor?: boolean } = {},
): DataSource {
    const desk = options.desk === true;
    const doctor = options.doctor === true;

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

    const enc = encodeURIComponent;

    /** A page or record that does not exist (or belongs to another clinic) reads as `null`, the page's "not found". */
    async function orNull<T>(what: string, url: string): Promise<T | null> {
        const res = await send('GET', url);

        if (res.status === 404) {
            return null;
        }

        if (res.status === 200 && res.body) {
            return res.body as unknown as T;
        }

        throw dataErrorFrom(what, res);
    }

    // The front desk. Each page reads the JSON of its own address; the booking panel and the actions use the shared /api
    // endpoints (patients, slots, appointments, and the clinic's doctors and services).
    const deskViews = {
        today: () => call<TodayView>('today', 'GET', '/reception'),
        appointments: (p: AppointmentsParams) =>
            call<AppointmentsView>(
                'appointments',
                'GET',
                `/reception/appointments${query({ when: p.when, doctorId: p.doctorId, status: p.status, q: p.q, sort: p.sort, page: p.page, perPage: p.perPage })}`,
            ),
        appointment: (id: Id) =>
            orNull<AppointmentDetailView>(
                'appointment',
                `/reception/appointments/${enc(id)}`,
            ),
        calendar: (p: CalendarParams) =>
            call<CalendarViewData>(
                'calendar',
                'GET',
                `/reception/calendar${query({ view: p.view, date: p.date ?? undefined, doctorId: p.doctorId })}`,
            ),
        patients: ({ q }: { q: string }) =>
            call<PatientsView>(
                'patients',
                'GET',
                `/reception/patients${query({ q })}`,
            ),
        patient: (id: Id) =>
            orNull<PatientDetailView>(
                'patient',
                `/reception/patients/${enc(id)}`,
            ),
    };

    // The doctor's own pages, and their answer to a patient's request to move a visit.
    const doctorRequests = {
        decide: (id: Id, input: RequestDecisionInput) =>
            call<RescheduleRequest>(
                'request decision',
                'PATCH',
                `/doctor/requests/${enc(id)}`,
                { ...input },
            ),
    };

    const doctorViews = {
        doctorOverview: () =>
            call<DoctorOverviewView>('overview', 'GET', '/doctor'),
        doctorSchedule: (p: DoctorScheduleParams) =>
            call<CalendarViewData>(
                'schedule',
                'GET',
                `/doctor/schedule${query({ view: p.view, date: p.date ?? undefined })}`,
            ),
        requests: () =>
            call<RequestsView>('requests', 'GET', '/doctor/requests'),
        doctorShell: () =>
            call<DoctorShellView>('shell', 'GET', '/doctor/shell'),
    };

    const deskClinic = {
        get: async (): Promise<Clinic> =>
            (await call<{ clinic: Clinic }>('clinic', 'GET', '/api/clinic'))
                .clinic,
        settings: async (): Promise<ClinicSettings> =>
            (
                await call<{ settings: ClinicSettings }>(
                    'clinic settings',
                    'GET',
                    '/api/clinic',
                )
            ).settings,
    };

    const deskDoctors = {
        list: (options?: { activeOnly?: boolean }) =>
            call<Doctor[]>(
                'doctors',
                'GET',
                `/api/doctors${query({ activeOnly: options?.activeOnly ? 1 : undefined })}`,
            ),
        get: (id: Id) =>
            call<Doctor>('doctor', 'GET', `/api/doctors/${enc(id)}`),
        availability: (id: Id) =>
            call<DoctorAvailability>(
                'doctor hours',
                'GET',
                `/api/doctors/${enc(id)}/availability`,
            ),
        nextFreeSlot: async (
            doctorId: Id,
            serviceId: Id,
        ): Promise<Slot | null> =>
            (
                await call<{ slot: Slot | null }>(
                    'next free slot',
                    'GET',
                    `/api/doctors/${enc(doctorId)}/next-free${query({ serviceId })}`,
                )
            ).slot,
    };

    const deskServices = {
        list: (options?: { activeOnly?: boolean }) =>
            call<Service[]>(
                'services',
                'GET',
                `/api/services${query({ activeOnly: options?.activeOnly ? 1 : undefined })}`,
            ),
    };

    const deskPatients = {
        search: (q: string, limit?: number) =>
            call<Patient[]>(
                'patient search',
                'GET',
                `/api/patients/search${query({ q, limit })}`,
            ),
        recent: (limit?: number) =>
            call<Patient[]>(
                'recent patients',
                'GET',
                `/api/patients/recent${query({ limit })}`,
            ),
        get: (id: Id) =>
            call<Patient>('patient', 'GET', `/api/patients/${enc(id)}`),
        create: (input: NewPatientInput) =>
            call<Patient>('patient create', 'POST', '/api/patients', {
                ...input,
            }),
        update: (id: Id, patch: PatientPatch) =>
            call<Patient>('patient save', 'PATCH', `/api/patients/${enc(id)}`, {
                ...patch,
            }),
    };

    const deskAppointments = {
        list: (q: AppointmentQuery = {}) =>
            call<Page<Appointment>>(
                'appointments',
                'GET',
                `/api/appointments${query({ from: q.from, to: q.to, doctorId: q.doctorId, status: q.status, patientId: q.patientId, patient: q.patient, sort: q.sort, page: q.page, perPage: q.perPage })}`,
            ),
        get: (id: Id) =>
            call<Appointment>(
                'appointment',
                'GET',
                `/api/appointments/${enc(id)}`,
            ),
        create: (input: NewAppointmentInput) =>
            call<Appointment>('booking', 'POST', '/api/appointments', {
                ...input,
            }),
        reschedule: (id: Id, startsAt: IsoDateTime) =>
            call<Appointment>(
                'reschedule',
                'PATCH',
                `/api/appointments/${enc(id)}/reschedule`,
                { startsAt },
            ),
        cancel: (id: Id) =>
            call<Appointment>(
                'cancel',
                'POST',
                `/api/appointments/${enc(id)}/cancel`,
            ),
        setStatus: (id: Id, status: AppointmentStatus) =>
            call<Appointment>(
                'status',
                'PATCH',
                `/api/appointments/${enc(id)}/status`,
                { status },
            ),
        undoStatus: (id: Id) =>
            call<Appointment>(
                'undo',
                'PATCH',
                `/api/appointments/${enc(id)}/status`,
                { undo: true },
            ),
        /** Messages arrive with the messaging step; until then an appointment has none. */
        timeline: (): Promise<TimelineItem[]> => Promise.resolve([]),
    };

    const deskSlots = {
        list: (q: SlotQuery) =>
            call<Slot[]>(
                'slots',
                'GET',
                `/api/availability${query({ doctorId: q.doctorId, serviceId: q.serviceId, date: q.date })}`,
            ),
        hold: (input: { doctorId: Id; serviceId: Id; startsAt: IsoDateTime }) =>
            call<SlotHold>('hold', 'POST', '/api/slot-holds', { ...input }),
        release: (holdId: Id) =>
            done('release', 'DELETE', `/api/slot-holds/${enc(holdId)}`),
        holds: (date: IsoDate) =>
            call<SlotHold[]>(
                'holds',
                'GET',
                `/api/slot-holds${query({ date })}`,
            ),
        alternatives: (
            input: { doctorId: Id; serviceId: Id; startsAt: IsoDateTime },
            count?: number,
        ) =>
            call<Slot[]>(
                'alternatives',
                'GET',
                `/api/availability/alternatives${query({ doctorId: input.doctorId, serviceId: input.serviceId, startsAt: input.startsAt, count })}`,
            ),
    };

    return {
        ...mock,

        clinic: desk ? deskClinic : mock.clinic,
        patients: desk ? deskPatients : mock.patients,
        appointments: desk || doctor ? deskAppointments : mock.appointments,
        slots: desk ? deskSlots : mock.slots,

        views: {
            ...mock.views,
            ...(desk ? deskViews : {}),
            ...(doctor ? doctorViews : {}),

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
            ...(desk ? deskDoctors : {}),

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

        requests: doctor ? doctorRequests : mock.requests,

        services: {
            ...mock.services,
            ...(desk ? deskServices : {}),

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
