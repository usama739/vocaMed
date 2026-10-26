import { rangeOf } from './calendar-range';
import type { MockDatabase } from './seed';
import type { DataSource } from './source';
import { PREVIOUS_STATUS, STATUS_TRANSITIONS } from './status';
import { addDays, utcToZoned } from './time';
import {
    DataError,
    type Appointment,
    type AppointmentQuery,
    type AvailabilityDraft,
    type DoctorAvailability,
    type Id,
    type Patient,
    type Slot,
    type User,
} from './types';
import {
    defaultService,
    type Actor,
    type AppointmentAllowed,
    type AppointmentRow,
    type AppointmentsParams,
    type CalendarColumn,
    type DoctorDay,
    type PatientRow,
    type RequestRow,
    type ViewSource,
} from './views';

const VISITED = new Set(['done', 'in_consultation', 'arrived']);
const UPCOMING = new Set(['booked', 'confirmed']);

/** When a patient was last seen and when they are next booked. */
export function summariseVisits(appointments: Appointment[], now: Date) {
    const t = now.getTime();
    const visits = appointments
        .filter(
            (a) => VISITED.has(a.status) && new Date(a.startsAt).getTime() <= t,
        )
        .map((a) => a.startsAt)
        .sort();
    const upcoming = appointments
        .filter(
            (a) =>
                UPCOMING.has(a.status) && new Date(a.startsAt).getTime() >= t,
        )
        .map((a) => a.startsAt)
        .sort();

    return {
        lastVisit: visits.at(-1) ?? null,
        next: upcoming[0] ?? null,
    };
}

/**
 * Builds the page read models from the mock tables. This is the server's job in production:
 * one query per page, joined, with the permissions already applied.
 */
export function createMockViews(
    core: Omit<DataSource, 'views'>,
    options: { now: () => Date; actorId: Id; db: MockDatabase },
): ViewSource {
    const { now, actorId, db } = options;

    const today = async () => {
        const clinic = await core.clinic.get();

        return {
            clinic,
            date: utcToZoned(now(), clinic.timezone).date,
            weekday: utcToZoned(now(), clinic.timezone).weekday,
        };
    };

    async function context() {
        const [users, doctors, services] = await Promise.all([
            core.users.list().catch(() => [] as User[]),
            core.doctors.list(),
            core.services.list(),
        ]);
        const me = users.find((u) => u.id === actorId);

        return { users, doctors, services, role: me?.role ?? 'receptionist' };
    }

    type Context = Awaited<ReturnType<typeof context>>;

    const actorOf = (id: Id, ctx: Context): Actor => {
        if (id === 'patient') {
            return { kind: 'patient', name: null };
        }

        const user = ctx.users.find((u) => u.id === id);

        return user
            ? { kind: 'user', name: user.name }
            : { kind: 'system', name: null };
    };

    /** The server owns these rules; the client only reads them. */
    const allowedFor = (
        appointment: Appointment,
        ctx: Context,
        sameDay: boolean,
    ): AppointmentAllowed => {
        const open =
            appointment.status === 'booked' ||
            appointment.status === 'confirmed';
        const doctor = ctx.role === 'doctor';
        const transitions = STATUS_TRANSITIONS[appointment.status].filter(
            (to) =>
                !doctor ||
                ((to === 'in_consultation' || to === 'done') &&
                    (appointment.status === 'arrived' ||
                        appointment.status === 'in_consultation')),
        );

        return {
            transitions,
            canUndo:
                !doctor &&
                sameDay &&
                PREVIOUS_STATUS[appointment.status] !== undefined,
            canReschedule: open && !doctor,
            canCancel: open && !doctor,
        };
    };

    async function rows(
        appointments: Appointment[],
        ctx?: Context,
    ): Promise<AppointmentRow[]> {
        const c = ctx ?? (await context());
        const { clinic } = await today();
        const day = utcToZoned(now(), clinic.timezone).date;
        const ids = [...new Set(appointments.map((a) => a.patientId))];
        const patients = await Promise.all(
            ids.map((id) => core.patients.get(id)),
        );

        return appointments.flatMap((appointment) => {
            const patient = patients.find(
                (p) => p.id === appointment.patientId,
            );
            const doctor = c.doctors.find((d) => d.id === appointment.doctorId);
            const service = c.services.find(
                (s) => s.id === appointment.serviceId,
            );

            return patient && doctor && service
                ? [
                      {
                          appointment,
                          patient,
                          doctor,
                          service,
                          createdBy: actorOf(appointment.createdBy, c),
                          allowed: allowedFor(
                              appointment,
                              c,
                              utcToZoned(
                                  new Date(appointment.startsAt),
                                  clinic.timezone,
                              ).date === day,
                          ),
                      },
                  ]
                : [];
        });
    }

    const pendingFor = (doctorId: Id) =>
        db.requests.filter(
            (r) => r.doctorId === doctorId && r.status === 'pending',
        ).length;

    /** Monday-first weekdays, as the availability page lists them. */
    const WEEK = [1, 2, 3, 4, 5, 6, 0];

    const draftOf = (stored: DoctorAvailability): AvailabilityDraft => ({
        days: WEEK.map((weekday) => {
            const window = stored.windows.find((w) => w.weekday === weekday);

            return window
                ? {
                      weekday,
                      on: true,
                      start: window.start,
                      end: window.end,
                      lunch: window.breaks.length > 0,
                  }
                : {
                      weekday,
                      on: false,
                      start: '09:00',
                      end: '13:00',
                      lunch: false,
                  };
        }),
        timeOff: stored.timeOff.map((t) => ({
            id: t.id,
            startDate: t.startDate,
            endDate: t.endDate,
            reason: t.reason,
        })),
        blocked: stored.blocked ?? [],
    });

    const notFound = (caught: unknown) =>
        caught instanceof DataError && caught.code === 'NOT_FOUND';

    const views: ViewSource = {
        async today() {
            const { clinic, date, weekday } = await today();
            const ctx = await context();
            const [settings, page, doctors] = await Promise.all([
                core.clinic.settings(),
                core.appointments.list({ from: date, to: date, perPage: 500 }),
                core.doctors.list({ activeOnly: true }),
            ]);
            const all = await rows(page.items, ctx);
            const holiday = settings.holidays.some((h) => h.date === date);

            const days = await Promise.all(
                doctors.map(async (doctor): Promise<DoctorDay> => {
                    const service = defaultService(doctor, ctx.services);
                    const [availability, nextFree] = await Promise.all([
                        core.doctors.availability(doctor.id),
                        service
                            ? core.doctors.nextFreeSlot(doctor.id, service.id)
                            : Promise.resolve(null),
                    ]);
                    const off = availability.timeOff.some(
                        (t) => t.startDate <= date && date <= t.endDate,
                    );

                    return {
                        doctor,
                        nextFree,
                        notWorking:
                            holiday ||
                            off ||
                            !availability.windows.some(
                                (w) => w.weekday === weekday,
                            ),
                        rows: all
                            .filter((r) => r.appointment.doctorId === doctor.id)
                            .sort((a, b) =>
                                a.appointment.startsAt.localeCompare(
                                    b.appointment.startsAt,
                                ),
                            ),
                    };
                }),
            );

            return { clinic, today: date, services: ctx.services, days };
        },

        async appointments(params: AppointmentsParams) {
            const { clinic, date } = await today();
            const range =
                params.when === 'today'
                    ? { from: date, to: date }
                    : params.when === 'next7'
                      ? { from: date, to: addDays(date, 7) }
                      : params.when === 'past7'
                        ? { from: addDays(date, -7), to: addDays(date, -1) }
                        : {};
            const query: AppointmentQuery = {
                ...range,
                ...(params.doctorId ? { doctorId: params.doctorId } : {}),
                ...(params.status ? { status: params.status } : {}),
                ...(params.q ? { patient: params.q } : {}),
                sort: params.sort === 'asc' ? 'startsAt' : '-startsAt',
                page: params.page,
                perPage: params.perPage ?? 10,
            };
            const [page, ctx] = await Promise.all([
                core.appointments.list(query),
                context(),
            ]);

            return {
                clinic,
                today: date,
                doctors: ctx.doctors,
                page: { ...page, items: await rows(page.items, ctx) },
            };
        },

        async appointment(id) {
            try {
                const appointment = await core.appointments.get(id);
                const [{ clinic, date }, ctx, timeline, audit] =
                    await Promise.all([
                        today(),
                        context(),
                        core.appointments.timeline(id),
                        core.audit.list({ subjectId: id }),
                    ]);
                const [row] = await rows([appointment], ctx);

                return {
                    clinic,
                    today: date,
                    row,
                    timeline,
                    history: audit.map((entry) => ({
                        id: entry.id,
                        action: entry.action,
                        meta: entry.meta,
                        at: entry.at,
                        actor: actorOf(entry.actorId, ctx),
                    })),
                };
            } catch (caught) {
                if (notFound(caught)) {
                    return null;
                }

                throw caught;
            }
        },

        async calendar(params) {
            const { clinic, date: todayDate } = await today();
            const date = params.date ?? todayDate;
            const range = rangeOf(params.view, date);
            const ctx = await context();
            const [settings, allDoctors, page] = await Promise.all([
                core.clinic.settings(),
                core.doctors.list({ activeOnly: true }),
                core.appointments.list({
                    from: range.from,
                    to: range.to,
                    ...(params.doctorId !== 'all'
                        ? { doctorId: params.doctorId }
                        : {}),
                    perPage: 2000,
                }),
            ]);
            const doctors =
                params.doctorId === 'all'
                    ? allDoctors
                    : allDoctors.filter((d) => d.id === params.doctorId);
            const appointmentRows = await rows(page.items, ctx);

            let columns: CalendarColumn[] = [];

            if (params.view === 'day') {
                columns = await Promise.all(
                    doctors.map(async (doctor) => {
                        const service = defaultService(doctor, ctx.services);
                        const [availability, slots] = await Promise.all([
                            core.doctors.availability(doctor.id),
                            service
                                ? core.slots.list({
                                      doctorId: doctor.id,
                                      serviceId: service.id,
                                      date,
                                  })
                                : Promise.resolve([] as Slot[]),
                        ]);

                        return {
                            doctor,
                            service,
                            slots,
                            availability,
                            offToday:
                                settings.holidays.some(
                                    (h) => h.date === date,
                                ) ||
                                availability.timeOff.some(
                                    (t) =>
                                        t.startDate <= date &&
                                        date <= t.endDate,
                                ),
                        };
                    }),
                );
            }

            return {
                clinic,
                settings,
                today: todayDate,
                date,
                allDoctors,
                doctors,
                rows: appointmentRows,
                columns,
                nowIso: now().toISOString(),
            };
        },

        async patients({ q }) {
            const { clinic, date } = await today();
            const found: Patient[] = q
                ? await core.patients.search(q, 25)
                : await core.patients.recent(8);
            const pages = await Promise.all(
                found.map((p) =>
                    core.appointments.list({ patientId: p.id, perPage: 200 }),
                ),
            );

            return {
                clinic,
                today: date,
                rows: found.map((patient, index): PatientRow => ({
                    patient,
                    ...summariseVisits(pages[index].items, now()),
                })),
            };
        },

        async patient(id) {
            try {
                const [{ clinic, date }, patient, page, ctx] =
                    await Promise.all([
                        today(),
                        core.patients.get(id),
                        core.appointments.list({ patientId: id, perPage: 200 }),
                        context(),
                    ]);

                return {
                    clinic,
                    today: date,
                    patient,
                    appointments: await rows(page.items, ctx),
                };
            } catch (caught) {
                if (notFound(caught)) {
                    return null;
                }

                throw caught;
            }
        },

        async notifications() {
            const [{ clinic, date }, entries] = await Promise.all([
                today(),
                core.notifications.list(),
            ]);
            const ids = [...new Set(entries.map((e) => e.patientId))];
            const patients = await Promise.all(
                ids.map((id) => core.patients.get(id).catch(() => undefined)),
            );

            return {
                clinic,
                today: date,
                rows: entries.map((entry) => ({
                    entry,
                    patient: patients.find((p) => p?.id === entry.patientId),
                })),
            };
        },

        async doctorOverview() {
            const me = await core.doctors.me();
            const { clinic, date } = await today();
            const ctx = await context();
            const [todays, ahead] = await Promise.all([
                core.appointments.list({
                    doctorId: me.id,
                    from: date,
                    to: date,
                    perPage: 500,
                }),
                core.appointments.list({
                    doctorId: me.id,
                    from: addDays(date, 1),
                    to: addDays(date, 30),
                    perPage: 1000,
                }),
            ]);
            const days = new Set(
                ahead.items
                    .filter((a) => a.status !== 'cancelled')
                    .map(
                        (a) =>
                            utcToZoned(new Date(a.startsAt), clinic.timezone)
                                .date,
                    ),
            );

            return {
                clinic,
                today: date,
                doctor: me,
                rows: (await rows(todays.items, ctx)).sort((a, b) =>
                    a.appointment.startsAt.localeCompare(
                        b.appointment.startsAt,
                    ),
                ),
                daysAhead: days.size,
                pendingRequests: pendingFor(me.id),
            };
        },

        async doctorSchedule(params) {
            const me = await core.doctors.me();

            return views.calendar({
                view: params.view,
                date: params.date,
                doctorId: me.id,
            });
        },

        async availability() {
            const me = await core.doctors.me();
            const { clinic, date } = await today();
            const stored: DoctorAvailability = await core.doctors.availability(
                me.id,
            );
            const draft = draftOf(stored);

            return {
                clinic,
                today: date,
                doctor: me,
                draft,
                preview: await core.doctors.previewAvailability(draft),
            };
        },

        async requests() {
            const me = await core.doctors.me();
            const { clinic, date } = await today();
            const ctx = await context();
            const mine = db.requests
                .filter(
                    (r) => r.clinicId === me.clinicId && r.doctorId === me.id,
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const all: RequestRow[] = [];

            for (const request of mine) {
                const appointment = await core.appointments.get(
                    request.appointmentId,
                );
                const [row] = await rows([appointment], ctx);

                if (row) {
                    all.push({ request: structuredClone(request), row });
                }
            }

            return {
                clinic,
                today: date,
                doctor: me,
                pending: all.filter((r) => r.request.status === 'pending'),
                history: all.filter((r) => r.request.status !== 'pending'),
            };
        },

        async doctorShell() {
            const me = await core.doctors.me().catch(() => null);

            return { pendingRequests: me ? pendingFor(me.id) : 0 };
        },
    };

    return views;
}
