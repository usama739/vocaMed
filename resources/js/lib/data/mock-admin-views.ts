import { generateStats } from './admin-stats';
import { blankDraft, draftOf } from './availability-draft';
import type { MockDatabase } from './seed';
import type { DataSource } from './source';
import { DEFAULT_TEMPLATE_BODIES, TEMPLATE_SAMPLE } from './template-defaults';
import { addDays, utcToZoned } from './time';
import {
    DataError,
    TEMPLATE_VARIABLES,
    type Channel,
    type Id,
    type Locale,
    type NotificationKind,
} from './types';
import {
    defaultService,
    type Actor,
    type AdminDoctorRow,
    type AdminTemplate,
    type AuditCategory,
    type AuditRow,
    type DoctorSignIn,
    type StaffRow,
    type ViewSource,
} from './views';

const KINDS: NotificationKind[] = [
    'confirmation',
    'reminder',
    'reschedule',
    'cancellation',
];
const CHANNELS: Channel[] = ['sms', 'whatsapp'];
const LOCALES: Locale[] = ['en', 'ur'];
const AUDIT_PAGE = 25;

/** Which audit filter an action belongs to. The server owns this grouping. */
export function auditCategory(action: string): AuditCategory {
    if (action === 'appointment.created') {
        return 'booking';
    }

    if (action === 'appointment.cancelled') {
        return 'cancel';
    }

    if (action.startsWith('auth.')) {
        return 'login';
    }

    if (action.startsWith('user.')) {
        return 'invite';
    }

    if (
        action.startsWith('settings.') ||
        action.startsWith('template.') ||
        action.startsWith('service.') ||
        action.startsWith('doctor.') ||
        action.startsWith('availability.')
    ) {
        return 'settings';
    }

    return 'edit';
}

type AdminViews = Pick<
    ViewSource,
    | 'adminOverview'
    | 'adminDoctors'
    | 'adminDoctor'
    | 'adminStaff'
    | 'adminServices'
    | 'adminSettings'
    | 'adminTemplates'
    | 'adminAudit'
>;

/** The clinic admin's read models, built from the mock tables (one query per page on the server). */
export function createAdminViews(
    core: Omit<DataSource, 'views'>,
    options: { now: () => Date; actorId: Id; db: MockDatabase },
): AdminViews {
    const { now, actorId, db } = options;

    const context = async () => {
        const clinic = await core.clinic.get();

        return {
            clinic,
            today: utcToZoned(now(), clinic.timezone).date,
            tz: clinic.timezone,
        };
    };

    function assertAdmin() {
        const me = db.users.find((u) => u.id === actorId);

        if (me?.role !== 'clinic_admin') {
            throw new DataError(
                'FORBIDDEN',
                'Only the clinic admin can see this',
            );
        }
    }

    const upcomingOf = (doctorId: Id, clinicId: Id) =>
        db.appointments.filter(
            (a) =>
                a.clinicId === clinicId &&
                a.doctorId === doctorId &&
                (a.status === 'booked' || a.status === 'confirmed') &&
                new Date(a.startsAt).getTime() >= now().getTime(),
        ).length;

    async function nextFreeFor(doctor: AdminDoctorRow['doctor']) {
        if (!doctor.active) {
            return null;
        }

        const services = await core.services.list();
        const service = defaultService(doctor, services);

        return service
            ? core.doctors.nextFreeSlot(doctor.id, service.id)
            : null;
    }

    const signInOf = (doctorId: Id, clinicId: Id): DoctorSignIn => {
        const doctor = db.doctors.find((d) => d.id === doctorId);
        const user = doctor?.userId
            ? db.users.find((u) => u.id === doctor.userId)
            : undefined;

        if (user) {
            return { state: 'active', email: user.email, invitationId: null };
        }

        const invitation = db.invitations.find(
            (i) =>
                i.clinicId === clinicId &&
                i.doctorId === doctorId &&
                i.status === 'pending',
        );

        if (!invitation) {
            return { state: 'none', email: null, invitationId: null };
        }

        return {
            state:
                new Date(invitation.expiresAt).getTime() < now().getTime()
                    ? 'expired'
                    : 'invited',
            email: invitation.email,
            invitationId: invitation.id,
        };
    };

    return {
        async adminOverview({ period }) {
            assertAdmin();
            const { clinic, today } = await context();
            const [doctors, services] = await Promise.all([
                core.doctors.list({ activeOnly: true }),
                core.services.list({ activeOnly: true }),
            ]);
            const stats = generateStats(
                period,
                today,
                doctors.map((d) => ({ id: d.id, name: d.name })),
                services.map((s) => ({ id: s.id, name: s.name })),
            );
            const todays = db.appointments.filter(
                (a) =>
                    a.clinicId === clinic.id &&
                    a.status !== 'cancelled' &&
                    utcToZoned(new Date(a.startsAt), clinic.timezone).date ===
                        today,
            );
            const todayDoctors = await Promise.all(
                doctors.map(async (doctor) => {
                    const mine = todays.filter((a) => a.doctorId === doctor.id);
                    const count = (status: string) =>
                        mine.filter((a) => a.status === status).length;

                    return {
                        doctor,
                        booked: mine.length,
                        arrived: count('arrived'),
                        inConsultation: count('in_consultation'),
                        done: count('done'),
                        nextFree: await nextFreeFor(doctor),
                    };
                }),
            );
            const unhoused = doctors.filter(
                (d) =>
                    !(
                        db.availability.find((a) => a.doctorId === d.id)
                            ?.windows.length ?? 0
                    ),
            );

            return {
                clinic,
                today,
                ...stats,
                todayDoctors,
                alerts: {
                    failedMessages: db.notifications.filter(
                        (n) =>
                            n.clinicId === clinic.id &&
                            n.status === 'failed' &&
                            !n.resentAt,
                    ).length,
                    doctorsWithoutHours: unhoused.map((d) => ({
                        id: d.id,
                        name: d.name,
                    })),
                },
            };
        },

        async adminDoctors({ q, status }) {
            assertAdmin();
            const { clinic, today } = await context();
            const all = await core.doctors.list();
            const needle = (q ?? '').trim().toLowerCase();
            const shown = all.filter(
                (d) =>
                    (status === 'all' ||
                        (status === 'active' ? d.active : !d.active)) &&
                    (!needle ||
                        `${d.name} ${d.specialty}`
                            .toLowerCase()
                            .includes(needle)),
            );
            const rows: AdminDoctorRow[] = await Promise.all(
                shown.map(async (doctor) => ({
                    doctor,
                    nextFree: await nextFreeFor(doctor),
                    upcoming: upcomingOf(doctor.id, clinic.id),
                })),
            );

            return { clinic, today, total: all.length, rows };
        },

        async adminDoctor({ doctorId }) {
            assertAdmin();
            const { clinic, today } = await context();
            const services = await core.services.list();

            if (doctorId === 'new') {
                const draft = blankDraft();

                return {
                    clinic,
                    today,
                    id: null,
                    profile: {
                        name: '',
                        specialty: '',
                        languages: ['en', 'ur'],
                        serviceIds: services
                            .filter((s) => s.active)
                            .map((s) => s.id),
                        active: true,
                    },
                    services,
                    upcoming: 0,
                    signIn: {
                        state: 'none',
                        email: null,
                        invitationId: null,
                    },
                    draft,
                    preview: await core.doctors.previewAvailability(
                        draft,
                        'new',
                    ),
                };
            }

            let doctor;

            try {
                doctor = await core.doctors.get(doctorId);
            } catch (caught) {
                if (
                    caught instanceof DataError &&
                    caught.code === 'NOT_FOUND'
                ) {
                    return null;
                }

                throw caught;
            }

            const draft = draftOf(await core.doctors.availability(doctor.id));

            return {
                clinic,
                today,
                id: doctor.id,
                profile: {
                    name: doctor.name,
                    specialty: doctor.specialty,
                    languages: doctor.languages,
                    serviceIds: doctor.serviceIds,
                    active: doctor.active,
                },
                services,
                upcoming: upcomingOf(doctor.id, clinic.id),
                signIn: signInOf(doctor.id, clinic.id),
                draft,
                preview: await core.doctors.previewAvailability(
                    draft,
                    doctor.id,
                ),
            };
        },

        async adminStaff() {
            assertAdmin();
            const { clinic } = await context();
            const users = await core.users.list();
            const invitations = await core.users.invitations();
            const admins = users.filter(
                (u) => u.role === 'clinic_admin' && u.active,
            );
            const rank = { active: 0, invited: 1, expired: 1, deactivated: 2 };

            const people: StaffRow[] = users
                .filter((u) => u.role !== 'doctor')
                .map((u) => {
                    const isYou = u.id === actorId;
                    const lastAdmin =
                        u.role === 'clinic_admin' &&
                        u.active &&
                        admins.length === 1;

                    return {
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role as StaffRow['role'],
                        status: u.active ? 'active' : 'deactivated',
                        isYou,
                        allowed: {
                            resend: false,
                            revoke: false,
                            deactivate: u.active && !isYou && !lastAdmin,
                            reactivate: !u.active,
                        },
                    };
                });
            const invited: StaffRow[] = invitations
                .filter((i) => i.status === 'pending' && !i.doctorId)
                .map((i) => ({
                    id: i.id,
                    name: null,
                    email: i.email,
                    role: i.role as StaffRow['role'],
                    status:
                        new Date(i.expiresAt).getTime() < now().getTime()
                            ? 'expired'
                            : 'invited',
                    isYou: false,
                    allowed: {
                        resend: true,
                        revoke: true,
                        deactivate: false,
                        reactivate: false,
                    },
                }));

            return {
                clinic,
                rows: [...people, ...invited].sort(
                    (a, b) => rank[a.status] - rank[b.status],
                ),
            };
        },

        async adminServices() {
            assertAdmin();
            const { clinic } = await context();
            const [services, doctors] = await Promise.all([
                core.services.list(),
                core.doctors.list(),
            ]);

            return {
                clinic,
                doctors,
                services: services.map((service) => ({
                    service,
                    doctorIds: doctors
                        .filter((d) => d.serviceIds.includes(service.id))
                        .map((d) => d.id),
                })),
            };
        },

        async adminSettings() {
            assertAdmin();
            const [{ clinic }, settings] = await Promise.all([
                context(),
                core.clinic.settings(),
            ]);

            return { clinic, settings };
        },

        async adminTemplates() {
            assertAdmin();
            const { clinic } = await context();
            const templates: AdminTemplate[] = KINDS.flatMap((kind) =>
                CHANNELS.flatMap((channel) =>
                    LOCALES.map((locale) => {
                        const custom = db.templates.find(
                            (t) =>
                                t.clinicId === clinic.id &&
                                t.kind === kind &&
                                t.channel === channel &&
                                t.locale === locale,
                        );
                        const defaultBody =
                            DEFAULT_TEMPLATE_BODIES[kind][locale];

                        return {
                            kind,
                            channel,
                            locale,
                            body: custom?.body ?? defaultBody,
                            defaultBody,
                            isCustom: !!custom,
                        };
                    }),
                ),
            );

            return {
                clinic,
                templates,
                variables: [...TEMPLATE_VARIABLES],
                sample: {
                    en: { ...TEMPLATE_SAMPLE.en, clinic_name: clinic.name },
                    ur: { ...TEMPLATE_SAMPLE.ur, clinic_name: clinic.name },
                },
            };
        },

        async adminAudit(params) {
            assertAdmin();
            const { clinic, today, tz } = await context();
            const users = await core.users.list();
            const actorOf = (id: Id): Actor => {
                if (id === 'patient') {
                    return { kind: 'patient', name: null };
                }

                const user = users.find((u) => u.id === id);

                return user
                    ? { kind: 'user', name: user.name }
                    : { kind: 'system', name: null };
            };
            const since = addDays(today, 1 - params.days);
            const inScope = db.audit
                .filter((e) => e.clinicId === clinic.id)
                .sort((a, b) => b.at.localeCompare(a.at));
            const matching = inScope.filter(
                (e) =>
                    utcToZoned(new Date(e.at), tz).date >= since &&
                    (!params.userId || e.actorId === params.userId) &&
                    (!params.category ||
                        auditCategory(e.action) === params.category),
            );
            const page = Math.max(1, params.page);
            const rows: AuditRow[] = matching
                .slice((page - 1) * AUDIT_PAGE, page * AUDIT_PAGE)
                .map((entry) => {
                    const appointment =
                        entry.subjectType === 'appointment'
                            ? db.appointments.find(
                                  (a) => a.id === entry.subjectId,
                              )
                            : undefined;
                    const patient = appointment
                        ? db.patients.find(
                              (p) => p.id === appointment.patientId,
                          )
                        : undefined;
                    const doctor = appointment
                        ? db.doctors.find((d) => d.id === appointment.doctorId)
                        : undefined;

                    return {
                        id: entry.id,
                        at: entry.at,
                        actor: actorOf(entry.actorId),
                        category: auditCategory(entry.action),
                        action: entry.action,
                        meta: structuredClone(entry.meta),
                        ...(appointment && patient && doctor
                            ? {
                                  appointment: {
                                      patientName: patient.name,
                                      doctorName: doctor.name,
                                      startsAt: appointment.startsAt,
                                  },
                              }
                            : {}),
                    };
                });
            const seen = new Set(inScope.map((e) => e.actorId));

            return {
                clinic,
                today,
                total: matching.length,
                page,
                perPage: AUDIT_PAGE,
                rows,
                users: users
                    .filter((u) => seen.has(u.id))
                    .map((u) => ({ id: u.id, name: u.name }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            };
        },
    };
}
