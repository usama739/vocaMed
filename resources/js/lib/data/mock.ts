import { createMockViews } from './mock-views';
import type { MockDatabase } from './seed';
import type { DataSource, PatientLinkSource } from './source';
import { PREVIOUS_STATUS, STATUS_TRANSITIONS } from './status';
import { addDays, addMinutes, utcToZoned, weekdayOf, zonedToUtc } from './time';
import {
    DataError,
    type Appointment,
    type AvailabilityDraft,
    type DayHours,
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
    type TimelineItem,
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

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;
const LUNCH = [13 * 60, 14 * 60] as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildCore(
    db: MockDatabase,
    options: MockOptions,
): Omit<DataSource, 'views'> {
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
                    ) ||
                    (availability.blocked ?? []).some(
                        (b) =>
                            b.weekday === window.weekday &&
                            overlaps(
                                m,
                                m + service.durationMin,
                                toMin(b.time),
                                toMin(b.time) + 30,
                            ),
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
            throw new DataError(
                'INVALID_PHONE',
                'Enter a valid phone number',
                [],
                'phone',
            );
        }

        return e164;
    }

    const actor = () => db.users.find((u) => u.id === actorId);
    const isDoctor = () => actor()?.role === 'doctor';
    /** Everything except starting and finishing a consultation belongs to reception and admin. */
    function assertStaff() {
        if (isDoctor()) {
            throw new DataError('FORBIDDEN', 'Doctors cannot do this');
        }
    }
    const myDoctor = () => {
        const found = db.doctors.find(
            (d) => d.clinicId === clinicId && d.userId === actorId,
        );

        if (!found) {
            throw new DataError('NOT_FOUND', 'No doctor for this user');
        }

        return found;
    };

    const service = (id: Id) => find(db.services, id, 'Service');

    function checkDraft(draft: AvailabilityDraft) {
        const step = (time: string) =>
            /^\d{2}:(00|30)$/.test(time) &&
            toMin(time) >= 6 * 60 &&
            toMin(time) <= 20 * 60;

        for (const day of draft.days) {
            if (
                day.on &&
                (!step(day.start) ||
                    !step(day.end) ||
                    toMin(day.start) >= toMin(day.end))
            ) {
                throw new DataError(
                    'VALIDATION',
                    'Working hours are not valid',
                    [],
                    'days',
                );
            }
        }

        for (const off of draft.timeOff) {
            if (!off.startDate || !off.endDate || off.endDate < off.startDate) {
                throw new DataError(
                    'VALIDATION',
                    'Time off dates are not valid',
                    [],
                    'timeOff',
                );
            }
        }
    }

    function transition(appointment: Appointment, status: AppointmentStatus) {
        if (!STATUS_TRANSITIONS[appointment.status].includes(status)) {
            throw new DataError(
                'INVALID_TRANSITION',
                `Cannot change ${appointment.status} to ${status}`,
            );
        }

        appointment.status = status;
    }

    function rescheduleAsSystem(id: Id, startsAt: IsoDateTime) {
        return rescheduleNow(id, startsAt, true);
    }

    function rescheduleNow(
        id: Id,
        startsAt: IsoDateTime,
        approved = false,
    ): Appointment {
        if (!approved) {
            assertStaff();
        }

        const appointment = find(db.appointments, id, 'Appointment');

        if (
            appointment.status !== 'booked' &&
            appointment.status !== 'confirmed'
        ) {
            throw new DataError(
                'INVALID_TRANSITION',
                `Cannot reschedule a ${appointment.status} appointment`,
            );
        }

        const service = find(db.services, appointment.serviceId, 'Service');

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
        db.holds = db.holds.filter((h) => h.heldBy !== actorId);
        queueNotification(appointment, 'reschedule');
        audit('appointment.rescheduled', 'appointment', id, {
            from: previous,
            to: startsAt,
        });

        return appointment;
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
            me: () => call(() => myDoctor()),

            saveAvailability: (draft) =>
                call(() => {
                    const doctor = myDoctor();
                    checkDraft(draft);
                    const stored = db.availability.find(
                        (a) => a.doctorId === doctor.id,
                    );
                    const next = {
                        doctorId: doctor.id,
                        windows: draft.days
                            .filter((d) => d.on)
                            .map((d) => ({
                                weekday: d.weekday,
                                start: d.start,
                                end: d.end,
                                breaks:
                                    d.lunch && toMin(d.end) > LUNCH[1]
                                        ? [
                                              {
                                                  start: fromMin(LUNCH[0]),
                                                  end: fromMin(LUNCH[1]),
                                              },
                                          ]
                                        : [],
                            })),
                        timeOff: draft.timeOff.map((t) => ({
                            id: t.id ?? nextId('to'),
                            doctorId: doctor.id,
                            startDate: t.startDate,
                            endDate: t.endDate,
                            reason: t.reason,
                        })),
                        blocked: draft.blocked,
                    };

                    if (stored) {
                        Object.assign(stored, next);
                    } else {
                        db.availability.push(next);
                    }

                    audit('availability.updated', 'doctor', doctor.id);
                }),

            previewAvailability: (draft) =>
                call(() => {
                    const doctor = myDoctor();
                    checkDraft(draft);
                    const open = (day: DayHours, m: number) =>
                        day.on &&
                        m >= toMin(day.start) &&
                        m + 30 <= toMin(day.end) &&
                        !(day.lunch && m >= LUNCH[0] && m < LUNCH[1]) &&
                        !draft.blocked.some(
                            (b) =>
                                b.weekday === day.weekday &&
                                toMin(b.time) === m,
                        );
                    const slotsPerWeekday = draft.days.map((day) => {
                        let n = 0;

                        for (let m = 6 * 60; m < 20 * 60; m += 30) {
                            if (open(day, m)) {
                                n++;
                            }
                        }

                        return n;
                    });
                    const tz = clinic().timezone;
                    const t = now().getTime();
                    const affected = own(db.appointments)
                        .filter(
                            (a) =>
                                a.doctorId === doctor.id &&
                                (a.status === 'booked' ||
                                    a.status === 'confirmed') &&
                                new Date(a.startsAt).getTime() >= t,
                        )
                        .filter((a) => {
                            const local = utcToZoned(new Date(a.startsAt), tz);
                            const day = draft.days.find(
                                (d) => d.weekday === local.weekday,
                            );
                            const m = toMin(local.time);
                            const end = m + service(a.serviceId).durationMin;
                            const fits =
                                !!day &&
                                day.on &&
                                m >= toMin(day.start) &&
                                end <= toMin(day.end) &&
                                !(
                                    day.lunch &&
                                    m < LUNCH[1] &&
                                    end > LUNCH[0]
                                ) &&
                                !draft.blocked.some(
                                    (b) =>
                                        b.weekday === local.weekday &&
                                        m < toMin(b.time) + 30 &&
                                        end > toMin(b.time),
                                );
                            const off = draft.timeOff.some(
                                (o) =>
                                    o.startDate <= local.date &&
                                    local.date <= o.endDate,
                            );

                            return !fits || off;
                        })
                        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                        .map((a) => ({
                            appointmentId: a.id,
                            patientName: find(
                                db.patients,
                                a.patientId,
                                'Patient',
                            ).name,
                            startsAt: a.startsAt,
                        }));

                    return {
                        slotsPerWeekday,
                        total: slotsPerWeekday.reduce((x, y) => x + y, 0),
                        affected,
                    };
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
                        throw new DataError(
                            'VALIDATION',
                            'Name is required',
                            [],
                            'name',
                        );
                    }

                    const phone =
                        input.noPhone && !input.phone.trim()
                            ? ''
                            : normalisePhone(input.phone);

                    if (
                        phone &&
                        own(db.patients).some((p) => p.phone === phone)
                    ) {
                        throw new DataError(
                            'DUPLICATE_PHONE',
                            'A patient with this phone number already exists',
                            [],
                            'phone',
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
            update: (id, patch) =>
                call(() => {
                    const patient = find(db.patients, id, 'Patient');
                    const next = { ...patch };

                    if (next.name !== undefined) {
                        next.name = next.name.trim();

                        if (!next.name) {
                            throw new DataError(
                                'VALIDATION',
                                'Name is required',
                                [],
                                'name',
                            );
                        }
                    }

                    if (next.phone !== undefined) {
                        next.phone = normalisePhone(next.phone);

                        if (
                            own(db.patients).some(
                                (p) => p.id !== id && p.phone === next.phone,
                            )
                        ) {
                            throw new DataError(
                                'DUPLICATE_PHONE',
                                'A patient with this phone number already exists',
                                [],
                                'phone',
                            );
                        }
                    }

                    Object.assign(patient, next);
                    audit('patient.updated', 'patient', id, {
                        fields: Object.keys(next).join(','),
                    });

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
                            (!query.patientId ||
                                a.patientId === query.patientId) &&
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
                    assertStaff();
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

                    // A walk-in is already at the desk, so a busy or past slot never refuses them.
                    const walkIn = input.source === 'walk_in';

                    if (!walkIn) {
                        assertBookable(doctor.id, service.id, input.startsAt);
                    }

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
                        status: walkIn ? 'arrived' : 'booked',
                        source: input.source,
                        reason: input.reason ?? null,
                        notes: input.notes ?? null,
                        createdAt: now().toISOString(),
                        createdBy: actorId,
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

                    if (!walkIn) {
                        queueNotification(appointment, 'confirmation');
                    }

                    audit(
                        'appointment.created',
                        'appointment',
                        appointment.id,
                        { source: input.source },
                    );

                    return appointment;
                }),

            reschedule: (id, startsAt) =>
                call(() => rescheduleNow(id, startsAt)),

            cancel: (id) =>
                call(() => {
                    assertStaff();
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
                    if (isDoctor()) {
                        const mine = myDoctor().id === appointment.doctorId;
                        const stage =
                            (status === 'in_consultation' ||
                                status === 'done') &&
                            (appointment.status === 'arrived' ||
                                appointment.status === 'in_consultation');

                        if (!mine || !stage) {
                            throw new DataError(
                                'FORBIDDEN',
                                'A doctor may only start or finish their own consultations',
                            );
                        }
                    }

                    const from = appointment.status;
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
                        from,
                    });

                    return appointment;
                }),

            undoStatus: (id) =>
                call(() => {
                    assertStaff();
                    const appointment = find(
                        db.appointments,
                        id,
                        'Appointment',
                    );
                    const tz = clinic().timezone;
                    const sameDay =
                        utcToZoned(new Date(appointment.startsAt), tz).date ===
                        utcToZoned(now(), tz).date;
                    const previous = PREVIOUS_STATUS[appointment.status];

                    if (!sameDay || !previous) {
                        throw new DataError(
                            'INVALID_TRANSITION',
                            `Nothing to undo for a ${appointment.status} appointment`,
                        );
                    }

                    const from = appointment.status;

                    if (from === 'no_show') {
                        const patient = find(
                            db.patients,
                            appointment.patientId,
                            'Patient',
                        );
                        patient.noShowCount = Math.max(
                            0,
                            patient.noShowCount - 1,
                        );
                    }

                    appointment.status = previous;
                    audit('appointment.status_reverted', 'appointment', id, {
                        status: previous,
                        from,
                    });

                    return appointment;
                }),

            timeline: (id) =>
                call(() => {
                    find(db.appointments, id, 'Appointment');
                    const items: TimelineItem[] = [
                        ...own(db.notifications)
                            .filter((n) => n.appointmentId === id)
                            .map((entry) => ({
                                type: 'message' as const,
                                id: entry.id,
                                at: entry.createdAt,
                                entry,
                            })),
                        ...own(db.replies)
                            .filter((r) => r.appointmentId === id)
                            .map((reply) => ({
                                type: 'reply' as const,
                                id: reply.id,
                                at: reply.at,
                                reply,
                            })),
                    ];

                    return items.sort((a, b) => b.at.localeCompare(a.at));
                }),
        },

        requests: {
            decide: (id, input) =>
                call(() => {
                    const request = find(db.requests, id, 'Request');

                    if (isDoctor() && request.doctorId !== myDoctor().id) {
                        throw new DataError('FORBIDDEN', 'Not your request');
                    }

                    if (request.status !== 'pending') {
                        throw new DataError(
                            'INVALID_TRANSITION',
                            'This request was already decided',
                        );
                    }

                    if (input.decision === 'approved') {
                        // Throws SLOT_UNAVAILABLE with alternatives if the time was taken meanwhile.
                        rescheduleAsSystem(
                            request.appointmentId,
                            request.proposedStartsAt,
                        );
                    }

                    request.status = input.decision;
                    request.message = input.message?.trim() || null;
                    request.decidedAt = now().toISOString();
                    audit(
                        'request.decided',
                        'appointment',
                        request.appointmentId,
                        {
                            decision: input.decision,
                        },
                    );

                    return request;
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

            holds: (date) =>
                call(() => {
                    pruneHolds();
                    const tz = clinic().timezone;

                    return own(db.holds).filter(
                        (h) =>
                            utcToZoned(new Date(h.startsAt), tz).date === date,
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
                    own(db.notifications)
                        .filter(
                            (n) =>
                                !filter?.status || n.status === filter.status,
                        )
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
                    original.resentAt = entry.createdAt;
                    audit(
                        'appointment.message_resent',
                        'appointment',
                        appointment.id,
                        {
                            kind: original.kind,
                        },
                    );
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
                            (!filter.subjectId ||
                                e.subjectId === filter.subjectId) &&
                            (!filter.action || e.action === filter.action) &&
                            (!filter.from || local >= filter.from) &&
                            (!filter.to || local <= filter.to)
                        );
                    });
                }),
        },
    };
}

/**
 * The mock "server": the tables behind `DataSource`, plus the page read models in `views`.
 * A view costs one round trip (like one request) however many tables it reads.
 */
export function createMockDataSource(
    db: MockDatabase,
    options: MockOptions,
): DataSource {
    const core = buildCore(db, options);
    const latency = options.latencyMs ?? 0;
    // Views read the tables directly, without a delay per table.
    const quick =
        latency > 0 ? buildCore(db, { ...options, latencyMs: 0 }) : core;
    const views = createMockViews(quick, {
        now: options.now ?? (() => new Date()),
        actorId: options.actorId,
        db,
    });
    const delayed =
        <A extends unknown[], R>(read: (...args: A) => Promise<R>) =>
        async (...args: A): Promise<R> => {
            if (latency > 0) {
                await sleep(latency);
            }

            return structuredClone(await read(...args));
        };

    return {
        ...core,
        views: {
            today: delayed(views.today),
            appointments: delayed(views.appointments),
            appointment: delayed(views.appointment),
            calendar: delayed(views.calendar),
            patients: delayed(views.patients),
            patient: delayed(views.patient),
            notifications: delayed(views.notifications),
            doctorOverview: delayed(views.doctorOverview),
            doctorSchedule: delayed(views.doctorSchedule),
            availability: delayed(views.availability),
            requests: delayed(views.requests),
            doctorShell: delayed(views.doctorShell),
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
