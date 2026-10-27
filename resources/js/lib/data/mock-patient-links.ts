import { createMockDataSource } from './mock';
import type { MockDatabase } from './seed';
import type { PatientLinkSource } from './source';
import { addDays, utcToZoned } from './time';
import {
    DataError,
    type Appointment,
    type Clinic,
    type ClinicSettings,
    type Doctor,
    type Id,
    type IsoDateTime,
    type Patient,
    type PatientReply,
    type Service,
} from './types';
import type {
    ExpiredLinkView,
    LinkAllowed,
    ManageView,
    QueueStage,
    RescheduleDay,
    RescheduleView,
    StatusView,
} from './patient-views';

/** Links stop working this long after the visit ends. */
const GRACE_MS = 24 * 3_600_000;
const HORIZON_DAYS = 14;
const REQUESTS_PER_MINUTE = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const roundUp5 = (minutes: number) => Math.ceil(minutes / 5) * 5;

type Resolved = {
    token: string;
    appointment: Appointment;
    clinic: Clinic;
    doctor: Doctor;
    service: Service;
    patient: Patient;
    settings: ClinicSettings;
    demoStage: QueueStage | undefined;
};

type Lookup =
    { ok: true; found: Resolved } | { ok: false; view: ExpiredLinkView };

/**
 * The mock "server" for the patient links: it opens a link, applies the rules (the late window,
 * pending requests, the queue) and answers with the page read models. A link opens one
 * appointment and nothing else.
 */
export function createMockPatientLinks(
    db: MockDatabase,
    options: { latencyMs?: number; now?: () => Date } = {},
): PatientLinkSource {
    const now = options.now ?? (() => new Date());
    const latency = options.latencyMs ?? 0;
    const asked = new Map<string, number[]>();

    async function respond<T>(work: () => T | Promise<T>): Promise<T> {
        if (latency > 0) {
            await sleep(latency);
        }

        return structuredClone(await work());
    }

    function lookup(token: string): Lookup {
        const link = db.links.get(token);
        const appointment =
            link && db.appointments.find((a) => a.id === link.appointmentId);
        const clinic =
            appointment &&
            db.clinics.find((c) => c.id === appointment.clinicId);
        const doctor =
            appointment &&
            db.doctors.find((d) => d.id === appointment.doctorId);
        const service =
            appointment &&
            db.services.find((s) => s.id === appointment.serviceId);
        const patient =
            appointment &&
            db.patients.find((p) => p.id === appointment.patientId);
        const settings =
            clinic && db.settings.find((s) => s.clinicId === clinic.id);

        // A guessed or garbled link says nothing about any clinic.
        if (
            !link ||
            !appointment ||
            !clinic ||
            !doctor ||
            !service ||
            !patient ||
            !settings
        ) {
            return { ok: false, view: { state: 'expired', clinic: null } };
        }

        if (
            link.expired ||
            now().getTime() > new Date(appointment.endsAt).getTime() + GRACE_MS
        ) {
            return {
                ok: false,
                view: {
                    state: 'expired',
                    clinic: { name: clinic.name, phone: clinic.phone },
                },
            };
        }

        return {
            ok: true,
            found: {
                token,
                appointment,
                clinic,
                doctor,
                service,
                patient,
                settings,
                demoStage: link.demoStage,
            },
        };
    }

    const open = (a: Appointment) =>
        a.status === 'booked' || a.status === 'confirmed';

    /** The rules, decided here once for every page. */
    function policy(r: Resolved) {
        const { appointment, settings } = r;
        const start = new Date(appointment.startsAt).getTime();
        const started = now().getTime() >= start;
        const windowHours = settings.cancellationWindowHours;
        const deadline =
            windowHours === null ? start : start - windowHours * 3_600_000;
        const late =
            open(appointment) && (started || now().getTime() > deadline)
                ? { deadline: new Date(deadline).toISOString() }
                : null;
        const pendingRequest = db.requests.some(
            (q) => q.appointmentId === appointment.id && q.status === 'pending',
        );
        const allowed: LinkAllowed = {
            confirm: appointment.status === 'booked' && !started,
            reschedule: open(appointment) && !late && !pendingRequest,
            cancel: open(appointment) && !late,
        };

        return { allowed, late, pendingRequest, windowHours, started };
    }

    function base(r: Resolved) {
        const { appointment, clinic, doctor, service, patient } = r;

        return {
            state: 'valid' as const,
            clinic: {
                name: clinic.name,
                phone: clinic.phone,
                address: clinic.address,
                timezone: clinic.timezone,
            },
            today: utcToZoned(now(), clinic.timezone).date,
            appointment: {
                firstName: patient.name.trim().split(/\s+/)[0] ?? '',
                doctorName: doctor.name,
                serviceName: service.name,
                durationMin: service.durationMin,
                startsAt: appointment.startsAt,
                status: appointment.status,
            },
            preferredLocale: patient.preferredLocale,
        };
    }

    const core = (clinicId: Id) =>
        createMockDataSource(db, {
            clinicId,
            // Not a staff user: the audit log names "the patient" and no staff rules apply.
            actorId: 'patient',
            now,
            latencyMs: 0,
        });

    function reply(r: Resolved, action: PatientReply['action']) {
        db.replies.push({
            id: `r_${++db.seq}`,
            clinicId: r.clinic.id,
            appointmentId: r.appointment.id,
            patientId: r.patient.id,
            at: now().toISOString(),
            action,
        });
    }

    function must(token: string): Resolved {
        const found = lookup(token);

        if (!found.ok) {
            throw new DataError('LINK_EXPIRED', 'This link has expired');
        }

        return found.found;
    }

    return {
        views: {
            manage: (token) =>
                respond((): ManageView | ExpiredLinkView => {
                    const found = lookup(token);

                    if (!found.ok) {
                        return found.view;
                    }

                    const r = found.found;
                    const rules = policy(r);
                    const view = base(r);

                    return {
                        ...view,
                        allowed: rules.allowed,
                        late: rules.late,
                        cancellationWindowHours: rules.windowHours,
                        pendingRequest: rules.pendingRequest,
                        queueOpen:
                            utcToZoned(
                                new Date(r.appointment.startsAt),
                                r.clinic.timezone,
                            ).date === view.today &&
                            r.appointment.status !== 'cancelled' &&
                            r.appointment.status !== 'no_show',
                    };
                }),

            reschedule: (token) =>
                respond(async (): Promise<RescheduleView | ExpiredLinkView> => {
                    const found = lookup(token);

                    if (!found.ok) {
                        return found.view;
                    }

                    const r = found.found;
                    const rules = policy(r);
                    const view = base(r);
                    const server = core(r.clinic.id);
                    const t = now().getTime();
                    const days: RescheduleDay[] = rules.allowed.reschedule
                        ? await Promise.all(
                              Array.from(
                                  { length: HORIZON_DAYS },
                                  async (_, i): Promise<RescheduleDay> => {
                                      const date = addDays(view.today, i);
                                      const all = await server.slots
                                          .list({
                                              doctorId: r.doctor.id,
                                              serviceId: r.service.id,
                                              date,
                                          })
                                          .catch(() => []);

                                      return {
                                          date,
                                          closed: all.length === 0,
                                          slots: all
                                              .filter(
                                                  (s) =>
                                                      s.state === 'free' &&
                                                      new Date(
                                                          s.startsAt,
                                                      ).getTime() > t,
                                              )
                                              .map((s) => s.startsAt),
                                      };
                                  },
                              ),
                          )
                        : [];

                    return {
                        ...view,
                        allowed: rules.allowed,
                        late: rules.late,
                        pendingRequest: rules.pendingRequest,
                        needsApproval: r.settings.rescheduleRequiresApproval,
                        days,
                    };
                }),

            status: (token) =>
                respond((): StatusView | ExpiredLinkView => {
                    const found = lookup(token);

                    if (!found.ok) {
                        return found.view;
                    }

                    const r = found.found;
                    const view = base(r);
                    const { appointment } = r;
                    const dayOf = (a: Appointment) =>
                        utcToZoned(new Date(a.startsAt), r.clinic.timezone)
                            .date;
                    const result = (
                        stage: QueueStage,
                        ahead = 0,
                        waitMin = 0,
                    ): StatusView => ({
                        ...view,
                        stage,
                        ahead,
                        waitMin,
                        updatedAt: now().toISOString(),
                    });

                    if (r.demoStage === 'next') {
                        return result('next');
                    }

                    if (dayOf(appointment) !== view.today) {
                        return result('notToday');
                    }

                    switch (appointment.status) {
                        case 'cancelled':
                        case 'no_show':
                            return result('ended');
                        case 'booked':
                        case 'confirmed':
                            return result('notYet');
                        case 'in_consultation':
                            return result('consult');
                        case 'done':
                            return result('done');
                    }

                    // Checked in: the queue is the doctor's checked-in patients, in appointment order.
                    const ahead = db.appointments.filter(
                        (a) =>
                            a.clinicId === r.clinic.id &&
                            a.doctorId === appointment.doctorId &&
                            a.id !== appointment.id &&
                            dayOf(a) === view.today &&
                            (a.status === 'in_consultation' ||
                                (a.status === 'arrived' &&
                                    a.startsAt < appointment.startsAt)),
                    );
                    const minutes = ahead.reduce(
                        (sum, a) =>
                            sum +
                            (db.services.find((s) => s.id === a.serviceId)
                                ?.durationMin ?? 15),
                        0,
                    );

                    return result(
                        ahead.length === 0 ? 'next' : 'waiting',
                        ahead.length,
                        roundUp5(minutes),
                    );
                }),

            expired: (token) =>
                respond((): ExpiredLinkView => {
                    const found = lookup(token);

                    if (!found.ok) {
                        return found.view;
                    }

                    return {
                        state: 'expired',
                        clinic: {
                            name: found.found.clinic.name,
                            phone: found.found.clinic.phone,
                        },
                    };
                }),
        },

        confirm: (token) =>
            respond(async () => {
                const r = must(token);
                const rules = policy(r);

                if (r.appointment.status === 'confirmed') {
                    return { status: r.appointment.status };
                }

                if (!open(r.appointment)) {
                    throw new DataError(
                        'INVALID_TRANSITION',
                        'This appointment cannot be confirmed',
                    );
                }

                if (rules.started) {
                    throw new DataError(
                        'OUTSIDE_WINDOW',
                        'The appointment has already started',
                    );
                }

                const saved = await core(r.clinic.id).appointments.setStatus(
                    r.appointment.id,
                    'confirmed',
                );
                reply(r, 'confirm');

                return { status: saved.status };
            }),

        cancel: (token) =>
            respond(async () => {
                const r = must(token);
                const rules = policy(r);

                if (!open(r.appointment)) {
                    throw new DataError(
                        'INVALID_TRANSITION',
                        'This appointment cannot be cancelled',
                    );
                }

                if (!rules.allowed.cancel) {
                    throw new DataError(
                        'OUTSIDE_WINDOW',
                        'It is too late to cancel online',
                    );
                }

                const saved = await core(r.clinic.id).appointments.cancel(
                    r.appointment.id,
                );
                reply(r, 'cancel');

                return { status: saved.status };
            }),

        reschedule: (token, startsAt: IsoDateTime) =>
            respond(async () => {
                const r = must(token);
                const rules = policy(r);

                if (!open(r.appointment) || rules.pendingRequest) {
                    throw new DataError(
                        'INVALID_TRANSITION',
                        'This appointment cannot be moved',
                    );
                }

                if (!rules.allowed.reschedule) {
                    throw new DataError(
                        'OUTSIDE_WINDOW',
                        'It is too late to change online',
                    );
                }

                const server = core(r.clinic.id);
                const today = utcToZoned(now(), r.clinic.timezone).date;
                const day = utcToZoned(
                    new Date(startsAt),
                    r.clinic.timezone,
                ).date;

                if (day < today || day > addDays(today, HORIZON_DAYS - 1)) {
                    throw new DataError(
                        'VALIDATION',
                        'Choose a time in the next 14 days',
                        [],
                        'startsAt',
                    );
                }

                const query = {
                    doctorId: r.doctor.id,
                    serviceId: r.service.id,
                };
                const slots = await server.slots.list({ ...query, date: day });
                const free = slots.some(
                    (s) =>
                        s.startsAt === startsAt &&
                        s.state === 'free' &&
                        new Date(s.startsAt).getTime() > now().getTime(),
                );

                if (!free) {
                    throw new DataError(
                        'SLOT_UNAVAILABLE',
                        'That time was just taken',
                        await server.slots.alternatives({ ...query, startsAt }),
                    );
                }

                if (r.settings.rescheduleRequiresApproval) {
                    db.requests.push({
                        id: `rq_${++db.seq}`,
                        clinicId: r.clinic.id,
                        appointmentId: r.appointment.id,
                        patientId: r.patient.id,
                        doctorId: r.doctor.id,
                        fromStartsAt: r.appointment.startsAt,
                        proposedStartsAt: startsAt,
                        status: 'pending',
                        message: null,
                        createdAt: now().toISOString(),
                        decidedAt: null,
                    });
                    reply(r, 'reschedule');

                    return { result: 'requested' as const, startsAt };
                }

                await server.appointments.reschedule(
                    r.appointment.id,
                    startsAt,
                );
                reply(r, 'reschedule');

                return { result: 'moved' as const, startsAt };
            }),

        requestNewLink: (token) =>
            respond(() => {
                // Known, expired or unknown: the answer is the same, so nobody can probe for bookings.
                const t = now().getTime();
                const recent = (asked.get(token) ?? []).filter(
                    (at) => t - at < 60_000,
                );

                if (recent.length >= REQUESTS_PER_MINUTE) {
                    throw new DataError(
                        'RATE_LIMITED',
                        'Too many requests. Try again in a minute.',
                    );
                }

                asked.set(token, [...recent, t]);
            }),

        resolve: (token) =>
            respond(() => {
                const found = lookup(token);

                if (!found.ok) {
                    return { state: 'expired' as const };
                }

                const { appointment, clinic, doctor, service } = found.found;

                return {
                    state: 'valid' as const,
                    appointment,
                    clinic,
                    doctor,
                    service,
                };
            }),
    };
}
