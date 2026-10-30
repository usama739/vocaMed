import { describe, expect, it, vi } from 'vitest';
import appointment from '../../../../tests/fixtures/appointment.json';
import appointmentsPage from '../../../../tests/fixtures/appointments-page.json';
import clinicLookup from '../../../../tests/fixtures/clinic-lookup.json';
import doctorOverview from '../../../../tests/fixtures/doctor-overview-view.json';
import doctorRequests from '../../../../tests/fixtures/doctor-requests-view.json';
import doctorShell from '../../../../tests/fixtures/doctor-shell-view.json';
import doctorHours from '../../../../tests/fixtures/doctor-hours.json';
import patient from '../../../../tests/fixtures/patient.json';
import receptionAppointment from '../../../../tests/fixtures/reception-appointment-view.json';
import receptionAppointments from '../../../../tests/fixtures/reception-appointments-view.json';
import receptionCalendar from '../../../../tests/fixtures/reception-calendar-view.json';
import receptionPatient from '../../../../tests/fixtures/reception-patient-view.json';
import receptionPatients from '../../../../tests/fixtures/reception-patients-view.json';
import receptionToday from '../../../../tests/fixtures/reception-today-view.json';
import slot from '../../../../tests/fixtures/slot.json';
import slotHold from '../../../../tests/fixtures/slot-hold.json';
import { createHttpSource } from './http-source';
import type { DataSource } from './source';
import { DataError } from './types';

type Call = { url: string; init: RequestInit };

/** A fetch that answers every request with one status and body, and remembers what it was asked. */
function fakeFetch(status: number, body: unknown = {}) {
    const calls: Call[] = [];
    const impl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });

        return Promise.resolve(
            new Response(body === null ? null : JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    }) as unknown as typeof fetch;

    return { impl, calls };
}

/** Stands in for the sample-data source: the desk source must not touch any of it. */
const mock = {
    clinicId: 'mock',
    views: { today: vi.fn(), notifications: vi.fn() },
    clinic: { get: vi.fn(), settings: vi.fn() },
    doctors: { list: vi.fn(), get: vi.fn(), me: vi.fn() },
    services: { list: vi.fn() },
    patients: { search: vi.fn() },
    appointments: { list: vi.fn() },
    slots: { list: vi.fn() },
    notifications: { list: vi.fn() },
} as unknown as DataSource;

const desk = (status: number, body: unknown = {}) => {
    const { impl, calls } = fakeFetch(status, body);

    return { source: createHttpSource(mock, impl, { desk: true }), calls };
};

const sent = (call: Call) => JSON.parse(String(call.init.body));

const caught = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the call to fail');
};

describe('the front desk source: what the reception pages read', () => {
    it('reads each page from its own address and hands the screen exactly what the server sent', async () => {
        const cases: [string, unknown, (s: DataSource) => Promise<unknown>][] =
            [
                ['/reception', receptionToday, (s) => s.views.today()],
                [
                    '/reception/appointments?when=any&sort=asc&page=1',
                    receptionAppointments,
                    (s) =>
                        s.views.appointments({
                            when: 'any',
                            sort: 'asc',
                            page: 1,
                        }),
                ],
                [
                    '/reception/appointments/abc',
                    receptionAppointment,
                    (s) => s.views.appointment('abc'),
                ],
                [
                    '/reception/calendar?view=week&doctorId=all',
                    receptionCalendar,
                    (s) =>
                        s.views.calendar({
                            view: 'week',
                            date: null,
                            doctorId: 'all',
                        }),
                ],
                [
                    '/reception/patients',
                    receptionPatients,
                    (s) => s.views.patients({ q: '' }),
                ],
                [
                    '/reception/patients/p1',
                    receptionPatient,
                    (s) => s.views.patient('p1'),
                ],
            ];

        for (const [url, fixture, read] of cases) {
            const { source, calls } = desk(200, fixture);

            expect(await read(source)).toEqual(fixture);
            expect(calls[0].url).toBe(url);
            expect(calls[0].init.method).toBe('GET');
        }
    });

    it('sends every filter of the appointments list and of the calendar in the query', async () => {
        const list = desk(200, receptionAppointments);
        await list.source.views.appointments({
            when: 'next7',
            doctorId: 'd1',
            status: 'confirmed',
            q: 'ayesha khan',
            sort: 'desc',
            page: 3,
            perPage: 25,
        });
        expect(list.calls[0].url).toBe(
            '/reception/appointments?when=next7&doctorId=d1&status=confirmed&q=ayesha%20khan&sort=desc&page=3&perPage=25',
        );

        const calendar = desk(200, receptionCalendar);
        await calendar.source.views.calendar({
            view: 'day',
            date: '2026-11-03',
            doctorId: 'd1',
        });
        expect(calendar.calls[0].url).toBe(
            '/reception/calendar?view=day&date=2026-11-03&doctorId=d1',
        );

        const search = desk(200, receptionPatients);
        await search.source.views.patients({ q: '0300 123' });
        expect(search.calls[0].url).toBe('/reception/patients?q=0300%20123');
    });

    it('reads an appointment or a patient that does not exist as null', async () => {
        expect(
            await desk(404, { code: 'NOT_FOUND' }).source.views.appointment(
                'x',
            ),
        ).toBeNull();
        expect(
            await desk(404, { code: 'NOT_FOUND' }).source.views.patient('x'),
        ).toBeNull();
    });

    it('fails with a plain error, which a page shows as retryable, on anything else', async () => {
        expect(
            await caught(desk(403, { code: 'FORBIDDEN' }).source.views.today()),
        ).toMatchObject({ code: 'FORBIDDEN' });
        expect(await caught(desk(500, {}).source.views.today())).toBeInstanceOf(
            Error,
        );
    });

    it('does not touch the sample data for anything the desk uses', async () => {
        const { source } = desk(200, {});

        expect(source.views.today).not.toBe(mock.views.today);
        expect(source.clinic).not.toBe(mock.clinic);
        expect(source.patients).not.toBe(mock.patients);
        expect(source.appointments).not.toBe(mock.appointments);
        expect(source.slots).not.toBe(mock.slots);
        expect(source.doctors.list).not.toBe(mock.doctors.list);
        expect(source.services.list).not.toBe(mock.services.list);
        // Messages arrive with the messaging step, and the doctor's own record is the doctor's area.
        expect(source.views.notifications).toBe(mock.views.notifications);
        expect(source.notifications).toBe(mock.notifications);
        expect(source.doctors.me).toBe(mock.doctors.me);
    });
});

describe('the front desk source: the clinic, doctors and services', () => {
    it('reads the clinic and its settings from one address', async () => {
        const clinic = desk(200, clinicLookup);
        expect(await clinic.source.clinic.get()).toEqual(clinicLookup.clinic);
        expect(clinic.calls[0].url).toBe('/api/clinic');

        const settings = desk(200, clinicLookup);
        expect(await settings.source.clinic.settings()).toEqual(
            clinicLookup.settings,
        );
    });

    it('lists doctors and services, only the active ones when asked, and reads one doctor and their hours', async () => {
        const doctor = receptionToday.days[0].doctor;

        const all = desk(200, [doctor]);
        await all.source.doctors.list();
        expect(all.calls[0].url).toBe('/api/doctors');

        const active = desk(200, [doctor]);
        expect(await active.source.doctors.list({ activeOnly: true })).toEqual([
            doctor,
        ]);
        expect(active.calls[0].url).toBe('/api/doctors?activeOnly=1');

        const one = desk(200, doctor);
        expect(await one.source.doctors.get('d 1')).toEqual(doctor);
        expect(one.calls[0].url).toBe('/api/doctors/d%201');

        const hours = desk(200, doctorHours);
        expect(await hours.source.doctors.availability('d1')).toEqual(
            doctorHours,
        );
        expect(hours.calls[0].url).toBe('/api/doctors/d1/availability');

        const services = desk(200, receptionToday.services);
        await services.source.services.list({ activeOnly: true });
        expect(services.calls[0].url).toBe('/api/services?activeOnly=1');
    });

    it('reads the next free slot, or null when there is none', async () => {
        const free = desk(200, { slot });
        expect(await free.source.doctors.nextFreeSlot('d1', 's1')).toEqual(
            slot,
        );
        expect(free.calls[0].url).toBe(
            '/api/doctors/d1/next-free?serviceId=s1',
        );

        expect(
            await desk(200, { slot: null }).source.doctors.nextFreeSlot(
                'd1',
                's1',
            ),
        ).toBeNull();
    });
});

describe('the front desk source: patients', () => {
    it('searches, lists the recent and reads one', async () => {
        const search = desk(200, [patient]);
        expect(await search.source.patients.search('0300 123', 5)).toEqual([
            patient,
        ]);
        expect(search.calls[0].url).toBe(
            '/api/patients/search?q=0300%20123&limit=5',
        );

        const recent = desk(200, [patient]);
        await recent.source.patients.recent(3);
        expect(recent.calls[0].url).toBe('/api/patients/recent?limit=3');

        const one = desk(200, patient);
        expect(await one.source.patients.get('p1')).toEqual(patient);
        expect(one.calls[0].url).toBe('/api/patients/p1');
    });

    it('creates and edits a patient and turns a refusal into the error the form shows', async () => {
        const create = desk(201, patient);
        await create.source.patients.create({
            name: 'Ayesha Khan',
            phone: '0300 1234567',
            consent: true,
        });
        expect(create.calls[0]).toMatchObject({
            url: '/api/patients',
            init: { method: 'POST' },
        });
        expect(sent(create.calls[0])).toEqual({
            name: 'Ayesha Khan',
            phone: '0300 1234567',
            consent: true,
        });

        const edit = desk(200, patient);
        await edit.source.patients.update('p1', { name: 'Ayesha K.' });
        expect(edit.calls[0]).toMatchObject({
            url: '/api/patients/p1',
            init: { method: 'PATCH' },
        });
        expect(sent(edit.calls[0])).toEqual({ name: 'Ayesha K.' });

        const taken = await caught(
            desk(422, {
                code: 'DUPLICATE_PHONE',
                message: 'Taken',
                field: 'phone',
            }).source.patients.create({ name: 'A', phone: '0300 1234567' }),
        );
        expect(taken).toBeInstanceOf(DataError);
        expect(taken).toMatchObject({
            code: 'DUPLICATE_PHONE',
            field: 'phone',
        });
    });
});

describe('the front desk source: appointments and slots', () => {
    it('lists appointments with the filters in the query', async () => {
        const list = desk(200, appointmentsPage);
        expect(
            await list.source.appointments.list({
                from: '2026-11-02',
                to: '2026-11-02',
                doctorId: 'd1',
                status: 'booked',
                patientId: 'p1',
                patient: 'ayesha',
                sort: '-startsAt',
                page: 2,
                perPage: 10,
            }),
        ).toEqual(appointmentsPage);
        expect(list.calls[0].url).toBe(
            '/api/appointments?from=2026-11-02&to=2026-11-02&doctorId=d1&status=booked&patientId=p1&patient=ayesha&sort=-startsAt&page=2&perPage=10',
        );

        const bare = desk(200, appointmentsPage);
        await bare.source.appointments.list();
        expect(bare.calls[0].url).toBe('/api/appointments');
    });

    it('books, moves, cancels and takes an appointment through its day, and undoes a stage', async () => {
        const input = {
            patientId: 'p1',
            doctorId: 'd1',
            serviceId: 's1',
            startsAt: '2026-11-02T05:00:00.000Z',
            source: 'manual' as const,
            reason: 'Check-up',
        };
        const book = desk(201, appointment);
        expect(await book.source.appointments.create(input)).toEqual(
            appointment,
        );
        expect(book.calls[0]).toMatchObject({
            url: '/api/appointments',
            init: { method: 'POST' },
        });
        expect(sent(book.calls[0])).toEqual(input);

        const get = desk(200, appointment);
        await get.source.appointments.get('a 1');
        expect(get.calls[0].url).toBe('/api/appointments/a%201');

        const move = desk(200, appointment);
        await move.source.appointments.reschedule(
            'a1',
            '2026-11-03T05:00:00.000Z',
        );
        expect(move.calls[0]).toMatchObject({
            url: '/api/appointments/a1/reschedule',
            init: { method: 'PATCH' },
        });
        expect(sent(move.calls[0])).toEqual({
            startsAt: '2026-11-03T05:00:00.000Z',
        });

        const cancel = desk(200, appointment);
        await cancel.source.appointments.cancel('a1');
        expect(cancel.calls[0]).toMatchObject({
            url: '/api/appointments/a1/cancel',
            init: { method: 'POST' },
        });

        const status = desk(200, appointment);
        await status.source.appointments.setStatus('a1', 'arrived');
        expect(status.calls[0]).toMatchObject({
            url: '/api/appointments/a1/status',
            init: { method: 'PATCH' },
        });
        expect(sent(status.calls[0])).toEqual({ status: 'arrived' });

        const undo = desk(200, appointment);
        await undo.source.appointments.undoStatus('a1');
        expect(sent(undo.calls[0])).toEqual({ undo: true });
    });

    it('has no message timeline until messages exist', async () => {
        const { source, calls } = desk(200, {});

        expect(await source.appointments.timeline('a1')).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('finds, holds and releases slots and offers the nearest alternatives', async () => {
        const list = desk(200, [slot]);
        expect(
            await list.source.slots.list({
                doctorId: 'd1',
                serviceId: 's1',
                date: '2026-11-02',
            }),
        ).toEqual([slot]);
        expect(list.calls[0].url).toBe(
            '/api/availability?doctorId=d1&serviceId=s1&date=2026-11-02',
        );

        const hold = desk(201, slotHold);
        const input = {
            doctorId: 'd1',
            serviceId: 's1',
            startsAt: '2026-11-02T05:00:00.000Z',
        };
        expect(await hold.source.slots.hold(input)).toEqual(slotHold);
        expect(hold.calls[0]).toMatchObject({
            url: '/api/slot-holds',
            init: { method: 'POST' },
        });
        expect(sent(hold.calls[0])).toEqual(input);

        const release = desk(200, { ok: true });
        await release.source.slots.release('h1');
        expect(release.calls[0]).toMatchObject({
            url: '/api/slot-holds/h1',
            init: { method: 'DELETE' },
        });

        const holds = desk(200, [slotHold]);
        await holds.source.slots.holds('2026-11-02');
        expect(holds.calls[0].url).toBe('/api/slot-holds?date=2026-11-02');

        const alternatives = desk(200, [slot]);
        await alternatives.source.slots.alternatives(input, 3);
        expect(alternatives.calls[0].url).toBe(
            '/api/availability/alternatives?doctorId=d1&serviceId=s1&startsAt=2026-11-02T05%3A00%3A00.000Z&count=3',
        );
    });

    it('turns a taken slot into SLOT_UNAVAILABLE carrying the nearest free ones', async () => {
        const error = await caught(
            desk(409, {
                code: 'SLOT_UNAVAILABLE',
                message: 'Gone',
                alternatives: [slot],
            }).source.appointments.create({
                patientId: 'p1',
                doctorId: 'd1',
                serviceId: 's1',
                startsAt: '2026-11-02T05:00:00.000Z',
                source: 'manual',
            }),
        );

        expect(error).toBeInstanceOf(DataError);
        expect(error).toMatchObject({
            code: 'SLOT_UNAVAILABLE',
            alternatives: [slot],
        });
    });

    it('turns a refused move into INVALID_TRANSITION and a refusal into FORBIDDEN', async () => {
        expect(
            await caught(
                desk(422, {
                    code: 'INVALID_TRANSITION',
                    message: 'No',
                }).source.appointments.setStatus('a1', 'done'),
            ),
        ).toMatchObject({ code: 'INVALID_TRANSITION' });
        expect(
            await caught(
                desk(403, {
                    code: 'FORBIDDEN',
                    message: 'No',
                }).source.appointments.cancel('a1'),
            ),
        ).toMatchObject({ code: 'FORBIDDEN' });
    });
});

describe("the doctor source: the doctor's own pages", () => {
    const asDoctor = (status: number, body: unknown = {}) => {
        const { impl, calls } = fakeFetch(status, body);

        return {
            source: createHttpSource(mock, impl, { doctor: true }),
            calls,
        };
    };

    it('reads the overview, the schedule, the requests and the badge from their own addresses', async () => {
        const cases: [string, unknown, (s: DataSource) => Promise<unknown>][] =
            [
                ['/doctor', doctorOverview, (s) => s.views.doctorOverview()],
                [
                    '/doctor/schedule?view=day',
                    receptionCalendar,
                    (s) => s.views.doctorSchedule({ view: 'day', date: null }),
                ],
                [
                    '/doctor/schedule?view=week&date=2026-11-03',
                    receptionCalendar,
                    (s) =>
                        s.views.doctorSchedule({
                            view: 'week',
                            date: '2026-11-03',
                        }),
                ],
                ['/doctor/requests', doctorRequests, (s) => s.views.requests()],
                ['/doctor/shell', doctorShell, (s) => s.views.doctorShell()],
            ];

        for (const [url, fixture, read] of cases) {
            const { source, calls } = asDoctor(200, fixture);

            expect(await read(source)).toEqual(fixture);
            expect(calls[0].url).toBe(url);
        }
    });

    it('moves their own consultations through the real status endpoint', async () => {
        const { source, calls } = asDoctor(200, appointment);

        await source.appointments.setStatus('a1', 'in_consultation');

        expect(calls[0]).toMatchObject({
            url: '/api/appointments/a1/status',
            init: { method: 'PATCH' },
        });
    });

    it('leaves the front desk, and the other roles, as they were', () => {
        const { source } = asDoctor(200, {});

        expect(source.views.today).toBe(mock.views.today);
        expect(source.patients).toBe(mock.patients);
        expect(source.slots).toBe(mock.slots);
        expect(source.views.notifications).toBe(mock.views.notifications);
    });
});
