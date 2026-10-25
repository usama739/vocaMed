import type { MockDatabase } from './seed';
import type { DataSource, PatientLinkSource } from './source';
import { addDays, addMinutes, utcToZoned, weekdayOf, zonedToUtc } from './time';
import {
    DataError,
    type Appointment,
    type AppointmentStatus,
    type AuditEntry,
    type Doctor,
    type Id,
    type IsoDateTime,
    type NewAppointmentInput,
    type NotificationKind,
    type Patient,
    type Service,
    type Slot,
    type SlotQuery,
} from './types';

export const SLOT_HOLD_SECONDS = 120;

export interface MockOptions {
    clinicId: Id;
    /** The signed-in staff member; owns slot holds and appears in the audit log. */
    actorId: Id;
    now?: () => Date;
    /** Simulated network latency per call. 0 keeps tests instant. */
    latencyMs?: number;
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
    booked: ['confirmed', 'arrived', 'cancelled', 'no_show'],
    confirmed: ['arrived', 'cancelled', 'no_show'],
    arrived: ['in_consultation', 'cancelled'],
    in_consultation: ['done'],
    done: [],
    cancelled: [],
    no_show: [],
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMockDataSource(
    db: MockDatabase,
    options: MockOptions,
): DataSource {
    const { clinicId, actorId } = options;
    const now = options.now ?? (() => new Date());
    const latency = options.latencyMs ?? 0;

    // ---- scoping: every read goes through these, so another clinic's rows are unreachable ----

    const clinic = () => {
        const found = db.clinics.find((c) => c.id === clinicId);

        if (!found) {
            throw new DataError('NOT_FOUND', `Clinic ${clinicId} not found`);
        }

        return found;
    };
    const own = <T extends { clinicId: Id }>(rows: T[]): T[] =>
        rows.filter((r) => r.clinicId === clinicId);
    const nextId = (prefix: string) => `${prefix}_${++db.seq}`;

    function find<T extends { id: Id; clinicId: Id }>(
        rows: T[],
        id: Id,
        label: string,
    ): T {
        const found = own(rows).find((r) => r.id === id);

        if (!found) {
            throw new DataError('NOT_FOUND', `${label} ${id} not found`);
        }

        return found;
    }

    /** Runs the work, then hands back a copy so callers can never mutate the "server" state. */
    async function call<T>(work: () => T): Promise<T> {
        if (latency > 0) {
            await sleep(latency);
        }

        return structuredClone(work());
    }

    function audit(
        action: string,
        subjectType: AuditEntry['subjectType'],
        subjectId: Id,
        meta: AuditEntry['meta'] = {},
    ) {
        db.audit.unshift({
            id: nextId('au'),
            clinicId,
            actorId,
            action,
            subjectType,
            subjectId,
            at: now().toISOString(),
            meta,
        });
    }

    function queueNotification(
        appointment: Appointment,
        kind: NotificationKind,
    ) {
        const patient = find(db.patients, appointment.patientId, 'Patient');
        const entry = {
            id: nextId('n'),
            clinicId,
            appointmentId: appointment.id,
            patientId: patient.id,
            kind,
            channel: patient.preferredChannel,
            status: 'queued' as const,
            createdAt: now().toISOString(),
            sentAt: null,
        };
        db.notifications.unshift(entry);

        return entry;
    }

    // ---- slots ----

    function pruneHolds() {
        const t = now().getTime();
        db.holds = db.holds.filter((h) => new Date(h.expiresAt).getTime() > t);
    }

    function computeSlots(query: SlotQuery, ignoreAppointmentId?: Id): Slot[] {
        pruneHolds();
        const c = clinic();
        const doctor = find(db.doctors, query.doctorId, 'Doctor');
        const service = find(db.services, query.serviceId, 'Service');

        if (!doctor.serviceIds.includes(service.id)) {
            throw new DataError(
                'VALIDATION',
                `${doctor.name} does not offer ${service.name}`,
            );
        }

        const settings = db.settings.find((s) => s.clinicId === clinicId);
        const availability = db.availability.find(
            (a) => a.doctorId === doctor.id,
        );

        if (
            !availability ||
            settings?.holidays.some((h) => h.date === query.date)
        ) {
            return [];
        }

        if (
            availability.timeOff.some(
                (t) => t.startDate <= query.date && query.date <= t.endDate,
            )
        ) {
            return [];
        }

        const busy = own(db.appointments)
            .filter(
                (a) =>
                    a.doctorId === doctor.id &&
                    a.id !== ignoreAppointmentId &&
                    a.status !== 'cancelled',
            )
            .map((a) => {
                const buffer =
                    db.services.find((s) => s.id === a.serviceId)?.bufferMin ??
                    0;

                return [
                    new Date(a.startsAt).getTime(),
                    new Date(a.endsAt).getTime() + buffer * 60_000,
                ] as const;
            });

        const slots: Slot[] = [];

        for (const window of availability.windows.filter(
            (w) => w.weekday === weekdayOf(query.date),
        )) {
            const breaks = window.breaks.map(
                (b) => [toMin(b.start), toMin(b.end)] as const,
            );

            for (
                let m = toMin(window.start);
                m + service.durationMin <= toMin(window.end);
                m += service.durationMin
            ) {
                if (
                    breaks.some(([bs, be]) =>
                        overlaps(m, m + service.durationMin, bs, be),
                    )
                ) {
                    continue;
                }

                const start = zonedToUtc(query.date, fromMin(m), c.timezone);
                const end = addMinutes(start, service.durationMin);
                const blockedUntil = addMinutes(
                    end,
                    service.bufferMin,
                ).getTime();

                if (start.getTime() < now().getTime()) {
                    continue;
                }

                if (
                    busy.some(([bs, be]) =>
                        overlaps(start.getTime(), blockedUntil, bs, be),
                    )
                ) {
                    continue;
                }

                const hold = db.holds.find(
                    (h) =>
                        h.clinicId === clinicId &&
                        h.doctorId === doctor.id &&
                        overlaps(
                            start.getTime(),
                            end.getTime(),
                            new Date(h.startsAt).getTime(),
                            new Date(h.startsAt).getTime() +
                                service.durationMin * 60_000,
                        ),
                );

                slots.push({
                    doctorId: doctor.id,
                    serviceId: service.id,
                    startsAt: start.toISOString(),
                    endsAt: end.toISOString(),
                    state: hold ? 'held' : 'free',
                    ...(hold ? { heldByMe: hold.heldBy === actorId } : {}),
                });
            }
        }

        return slots;
    }

    const isBookable = (slot: Slot) =>
        slot.state === 'free' || slot.heldByMe === true;

    function alternativesFor(
        doctorId: Id,
        serviceId: Id,
        startsAt: IsoDateTime,
        count: number,
        ignoreAppointmentId?: Id,
    ): Slot[] {
        const tz = clinic().timezone;
        const target = new Date(startsAt).getTime();
        const firstDay = utcToZoned(new Date(startsAt), tz).date;
        const candidates: Slot[] = [];

        // Look a week ahead; enough for the receptionist to offer something on the phone.
        for (let d = 0; d < 7; d++) {
            candidates.push(
                ...computeSlots(
                    { doctorId, serviceId, date: addDays(firstDay, d) },
                    ignoreAppointmentId,
                ).filter(isBookable),
            );
        }

        return candidates
            .filter((s) => s.startsAt !== startsAt)
            .sort(
                (a, b) =>
                    Math.abs(new Date(a.startsAt).getTime() - target) -
                    Math.abs(new Date(b.startsAt).getTime() - target),
            )
            .slice(0, count);
    }

    /** Throws SLOT_UNAVAILABLE with alternatives unless `startsAt` is a bookable slot for this doctor and service. */
    function assertBookable(
        doctorId: Id,
        serviceId: Id,
        startsAt: IsoDateTime,
        ignoreAppointmentId?: Id,
    ) {
        const date = utcToZoned(new Date(startsAt), clinic().timezone).date;
        const slot = computeSlots(
            { doctorId, serviceId, date },
            ignoreAppointmentId,
        ).find((s) => s.startsAt === startsAt);

        if (!slot || !isBookable(slot)) {
            throw new DataError(
                'SLOT_UNAVAILABLE',
                'That slot is no longer available',
                alternativesFor(
                    doctorId,
                    serviceId,
                    startsAt,
                    3,
                    ignoreAppointmentId,
                ),
            );
        }
    }

    // ---- patients ----

    function normalisePhone(raw: string): string {
        const compact = raw.replace(/[\s\-()]/g, '');
        const code = clinic().phoneCountryCode;
        const e164 = compact.startsWith('+')
            ? compact
            : compact.startsWith('0')
              ? `${code}${compact.slice(1)}`
              : `${code}${compact}`;

        if (!/^\+\d{8,15}$/.test(e164)) {
            throw new DataError('VALIDATION', 'Enter a valid phone number');
        }

        return e164;
    }

    function transition(appointment: Appointment, status: AppointmentStatus) {
        if (!TRANSITIONS[appointment.status].includes(status)) {
            throw new DataError(
                'INVALID_TRANSITION',
                `Cannot change ${appointment.status} to ${status}`,
            );
        }

        appointment.status = status;
    }

    const paginate = <T>(items: T[], page = 1, perPage = 20) => ({
        items: items.slice((page - 1) * perPage, page * perPage),
        total: items.length,
        page,
        perPage,
    });

    return {
        clinicId,

        clinic: {
            get: () => call(() => clinic()),
            settings: () =>
                call(() => {
                    const found = db.settings.find(
                        (s) => s.clinicId === clinicId,
                    );

                    if (!found) {
                        throw new DataError('NOT_FOUND', 'Settings not found');
                    }

                    return found;
                }),
        },

        users: {
            list: () => call(() => own(db.users)),
            invitations: () => call(() => own(db.invitations)),
        },

        doctors: {
            list: (opts) =>
                call(() =>
                    own(db.doctors).filter(
                        (d) => !opts?.activeOnly || d.active,
                    ),
                ),
            get: (id) => call(() => find(db.doctors, id, 'Doctor')),
            availability: (id) =>
                call(() => {
                    find(db.doctors, id, 'Doctor');
                    const found = db.availability.find(
                        (a) => a.doctorId === id,
                    );

                    return found ?? { doctorId: id, windows: [], timeOff: [] };
                }),
            nextFreeSlot: (doctorId, serviceId) =>
                call(() => {
                    const today = utcToZoned(now(), clinic().timezone).date;

                    for (let d = 0; d < 14; d++) {
                        const free = computeSlots({
                            doctorId,
                            serviceId,
                            date: addDays(today, d),
                        }).find((s) => s.state === 'free');

                        if (free) {
                            return free;
                        }
                    }

                    return null;
                }),
        },

        services: {
            list: (opts) =>
                call(() =>
                    own(db.services).filter(
                        (s: Service) => !opts?.activeOnly || s.active,
                    ),
                ),
        },

        patients: {
            search: (query, limit = 10) =>
                call(() => {
                    const q = query.trim().toLowerCase();
                    const digits = q.replace(/\D/g, '');
                    const rows = own(db.patients);

                    if (!q) {
                        return [];
                    }

                    const byPhone =
                        digits.length >= 3
                            ? rows.filter((p) =>
                                  p.phone
                                      .replace(/\D/g, '')
                                      .includes(digits.replace(/^0/, '')),
                              )
                            : [];
                    const byName = rows.filter(
                        (p) =>
                            p.name.toLowerCase().includes(q) &&
                            !byPhone.includes(p),
                    );

                    return [...byPhone, ...byName].slice(0, limit);
                }),
            recent: (limit = 5) =>
                call(() => {
                    const lastVisit = new Map<Id, string>();

                    for (const a of own(db.appointments)) {
                        const seen = lastVisit.get(a.patientId);

                        if (!seen || a.startsAt > seen) {
                            lastVisit.set(a.patientId, a.startsAt);
                        }
                    }

                    return [...own(db.patients)]
                        .sort((a, b) =>
                            (lastVisit.get(b.id) ?? '').localeCompare(
                                lastVisit.get(a.id) ?? '',
                            ),
                        )
                        .slice(0, limit);
                }),
            get: (id) => call(() => find(db.patients, id, 'Patient')),
            create: (input) =>
                call(() => {
                    const name = input.name.trim();

                    if (!name) {
                        throw new DataError('VALIDATION', 'Name is required');
                    }

                    const phone = normalisePhone(input.phone);

                    if (own(db.patients).some((p) => p.phone === phone)) {
                        throw new DataError(
                            'VALIDATION',
                            'A patient with this phone number already exists',
                        );
                    }

                    const patient: Patient = {
                        id: nextId('p'),
                        clinicId,
                        name,
                        phone,
                        preferredLocale:
                            input.preferredLocale ?? clinic().defaultLocale,
                        preferredChannel: input.preferredChannel ?? 'sms',
                        consent: input.consent ?? false,
                        noShowCount: 0,
                        notes: input.notes ?? '',
                        createdAt: now().toISOString(),
                    };
                    db.patients.push(patient);
                    audit('patient.created', 'patient', patient.id);

                    return patient;
                }),
        },

        appointments: {
            list: (query = {}) =>
                call(() => {
                    const tz = clinic().timezone;
                    const needle = query.patient?.trim().toLowerCase();
                    const digits = needle?.replace(/\D/g, '') ?? '';

                    const rows = own(db.appointments).filter((a) => {
                        const local = utcToZoned(new Date(a.startsAt), tz).date;
                        const patient = db.patients.find(
                            (p) => p.id === a.patientId,
                        );

                        return (
                            (!query.from || local >= query.from) &&
                            (!query.to || local <= query.to) &&
                            (!query.doctorId ||
                                a.doctorId === query.doctorId) &&
                            (!query.status || a.status === query.status) &&
                            (!needle ||
                                patient?.name.toLowerCase().includes(needle) ||
                                (digits.length >= 3 &&
                                    patient?.phone
                                        .replace(/\D/g, '')
                                        .includes(digits)))
                        );
                    });

                    rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

                    if (query.sort === '-startsAt') {
                        rows.reverse();
                    }

                    return paginate(rows, query.page, query.perPage);
                }),

            get: (id) => call(() => find(db.appointments, id, 'Appointment')),

            create: (input: NewAppointmentInput) =>
                call(() => {
                    find(db.patients, input.patientId, 'Patient');
                    const service = find(
                        db.services,
                        input.serviceId,
                        'Service',
                    );
                    const doctor: Doctor = find(
                        db.doctors,
                        input.doctorId,
                        'Doctor',
                    );

                    assertBookable(doctor.id, service.id, input.startsAt);

                    const appointment: Appointment = {
                        id: nextId('a'),
                        clinicId,
                        patientId: input.patientId,
                        doctorId: doctor.id,
                        serviceId: service.id,
                        startsAt: input.startsAt,
                        endsAt: addMinutes(
                            new Date(input.startsAt),
                            service.durationMin,
                        ).toISOString(),
                        status: 'booked',
                        source: input.source,
                        reason: input.reason ?? null,
                        notes: input.notes ?? null,
                        createdAt: now().toISOString(),
                    };
                    db.appointments.push(appointment);
                    db.holds = db.holds.filter(
                        (h) =>
                            !(h.heldBy === actorId && h.doctorId === doctor.id),
                    );
                    db.links.set(`tok_${appointment.id}`, {
                        appointmentId: appointment.id,
                        clinicId,
                        expired: false,
                    });
                    queueNotification(appointment, 'confirmation');
                    audit(
                        'appointment.created',
                        'appointment',
                        appointment.id,
                        { source: input.source },
                    );

                    return appointment;
                }),

            reschedule: (id, startsAt) =>
                call(() => {
                    const appointment = find(
                        db.appointments,
                        id,
                        'Appointment',
                    );

                    if (
                        appointment.status !== 'booked' &&
                        appointment.status !== 'confirmed'
                    ) {
                        throw new DataError(
                            'INVALID_TRANSITION',
                            `Cannot reschedule a ${appointment.status} appointment`,
                        );
                    }

                    const service = find(
                        db.services,
                        appointment.serviceId,
                        'Service',
                    );

                    assertBookable(
                        appointment.doctorId,
                        service.id,
                        startsAt,
                        appointment.id,
                    );

                    const previous = appointment.startsAt;
                    appointment.startsAt = startsAt;
                    appointment.endsAt = addMinutes(
                        new Date(startsAt),
                        service.durationMin,
                    ).toISOString();
                    appointment.status = 'booked';
                    queueNotification(appointment, 'reschedule');
                    audit('appointment.rescheduled', 'appointment', id, {
                        from: previous,
                        to: startsAt,
                    });

                    return appointment;
                }),

            cancel: (id) =>
                call(() => {
                    const appointment = find(
                        db.appointments,
                        id,
                        'Appointment',
                    );
                    transition(appointment, 'cancelled');
                    queueNotification(appointment, 'cancellation');
                    audit('appointment.cancelled', 'appointment', id);

                    return appointment;
                }),

            setStatus: (id, status) =>
                call(() => {
                    const appointment = find(
                        db.appointments,
                        id,
                        'Appointment',
                    );
                    transition(appointment, status);

                    if (status === 'no_show') {
                        find(
                            db.patients,
                            appointment.patientId,
                            'Patient',
                        ).noShowCount += 1;
                    }

                    audit('appointment.status_changed', 'appointment', id, {
                        status,
                    });

                    return appointment;
                }),
        },

        slots: {
            list: (query) => call(() => computeSlots(query)),

            hold: (input) =>
                call(() => {
                    assertBookable(
                        input.doctorId,
                        input.serviceId,
                        input.startsAt,
                    );
                    // One hold per user: picking another slot releases the previous one.
                    db.holds = db.holds.filter(
                        (h) =>
                            !(h.clinicId === clinicId && h.heldBy === actorId),
                    );

                    const hold = {
                        id: nextId('hold'),
                        clinicId,
                        doctorId: input.doctorId,
                        serviceId: input.serviceId,
                        startsAt: input.startsAt,
                        heldBy: actorId,
                        expiresAt: addMinutes(
                            now(),
                            SLOT_HOLD_SECONDS / 60,
                        ).toISOString(),
                    };
                    db.holds.push(hold);

                    return hold;
                }),

            release: (holdId) =>
                call(() => {
                    db.holds = db.holds.filter(
                        (h) => !(h.id === holdId && h.clinicId === clinicId),
                    );
                }),

            alternatives: (input, count = 3) =>
                call(() =>
                    alternativesFor(
                        input.doctorId,
                        input.serviceId,
                        input.startsAt,
                        count,
                    ),
                ),
        },

        notifications: {
            list: (filter) =>
                call(() =>
                    own(db.notifications).filter(
                        (n) => !filter?.status || n.status === filter.status,
                    ),
                ),

            resend: (id) =>
                call(() => {
                    const original = find(db.notifications, id, 'Notification');
                    const appointment = find(
                        db.appointments,
                        original.appointmentId,
                        'Appointment',
                    );
                    const entry = queueNotification(appointment, original.kind);
                    audit('notification.resent', 'notification', entry.id, {
                        of: id,
                    });

                    return entry;
                }),

            templates: () => call(() => own(db.templates)),
        },

        audit: {
            list: (filter = {}) =>
                call(() => {
                    const tz = clinic().timezone;

                    return own(db.audit).filter((e) => {
                        const local = utcToZoned(new Date(e.at), tz).date;

                        return (
                            (!filter.actorId || e.actorId === filter.actorId) &&
                            (!filter.action || e.action === filter.action) &&
                            (!filter.from || local >= filter.from) &&
                            (!filter.to || local <= filter.to)
                        );
                    });
                }),
        },
    };
}

export function createMockPatientLinks(
    db: MockDatabase,
    options: { latencyMs?: number } = {},
): PatientLinkSource {
    return {
        async resolve(token) {
            if (options.latencyMs) {
                await sleep(options.latencyMs);
            }

            const link = db.links.get(token);
            const appointment =
                link &&
                db.appointments.find((a) => a.id === link.appointmentId);
            const found =
                appointment &&
                db.clinics.find((c) => c.id === appointment.clinicId);
            const doctor =
                appointment &&
                db.doctors.find((d) => d.id === appointment.doctorId);
            const service =
                appointment &&
                db.services.find((s) => s.id === appointment.serviceId);

            if (
                !link ||
                link.expired ||
                !appointment ||
                !found ||
                !doctor ||
                !service
            ) {
                return { state: 'expired' };
            }

            return structuredClone({
                state: 'valid' as const,
                appointment,
                clinic: found,
                doctor,
                service,
            });
        },
    };
}
