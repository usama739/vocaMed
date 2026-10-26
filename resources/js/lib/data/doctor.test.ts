// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from './mock';
import { createSeedDatabase, DEMO_CLINIC_ID, type MockDatabase } from './seed';
import type { DataSource } from './source';

// Monday 10:15 in Karachi.
const NOW = new Date('2026-10-26T05:15:00.000Z');
const TODAY = '2026-10-26';

let db: MockDatabase;
const as = (actorId: string): DataSource =>
    createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId,
        now: () => new Date(),
    });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = createSeedDatabase(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('who the doctor is', () => {
    it('finds the doctor linked to the signed-in user, and nobody for other roles', async () => {
        expect((await as('u_doc1').doctors.me()).id).toBe('d_sana');
        expect((await as('u_doc2').doctors.me()).id).toBe('d_imran');
        await expect(as('u_recep').doctors.me()).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
    });
});

describe('what a doctor may change', () => {
    it('can start and finish their own consultations', async () => {
        const doctor = as('u_doc1');

        // a_003 is Arrived, a_002 is In consultation.
        await expect(
            doctor.appointments.setStatus('a_003', 'in_consultation'),
        ).resolves.toMatchObject({ status: 'in_consultation' });
        await expect(
            doctor.appointments.setStatus('a_002', 'done'),
        ).resolves.toMatchObject({ status: 'done' });
    });

    it('cannot mark arrived, finish someone not yet arrived, or touch another doctor’s patients', async () => {
        const doctor = as('u_doc1');

        await expect(
            doctor.appointments.setStatus('a_004', 'arrived'),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
            doctor.appointments.setStatus('a_004', 'done'),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        // a_005 belongs to Dr. Imran.
        await expect(
            as('u_doc1').appointments.setStatus('a_005', 'in_consultation'),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cannot book, move, cancel or undo anything', async () => {
        const doctor = as('u_doc1');

        await expect(doctor.appointments.cancel('a_004')).rejects.toMatchObject(
            {
                code: 'FORBIDDEN',
            },
        );
        await expect(
            doctor.appointments.undoStatus('a_003'),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
            doctor.appointments.reschedule('a_004', '2026-10-27T05:00:00.000Z'),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
});

describe('doctor views', () => {
    it('overview: only the doctor’s own day, in time order, with the request count', async () => {
        const view = await as('u_doc1').views.doctorOverview();

        expect(view.doctor.id).toBe('d_sana');
        expect(view.rows.length).toBeGreaterThanOrEqual(6);
        expect(
            view.rows.every((r) => r.appointment.doctorId === 'd_sana'),
        ).toBe(true);
        expect(view.rows.map((r) => r.appointment.startsAt)).toEqual(
            [...view.rows.map((r) => r.appointment.startsAt)].sort(),
        );
        expect(view.pendingRequests).toBe(2);
        expect(view.daysAhead).toBeGreaterThanOrEqual(3);
    });

    it('schedule: the calendar view scoped to the doctor', async () => {
        const view = await as('u_doc1').views.doctorSchedule({
            view: 'day',
            date: null,
        });

        expect(view.date).toBe(TODAY);
        expect(view.doctors.map((d) => d.id)).toEqual(['d_sana']);
        expect(view.columns).toHaveLength(1);
        expect(
            view.rows.every((r) => r.appointment.doctorId === 'd_sana'),
        ).toBe(true);
    });

    it('shell: the pending count for the sidebar, zero for other roles', async () => {
        expect((await as('u_doc1').views.doctorShell()).pendingRequests).toBe(
            2,
        );
        expect((await as('u_recep').views.doctorShell()).pendingRequests).toBe(
            0,
        );
    });
});

describe('availability', () => {
    it('presents the saved hours, breaks, blocked times and time off for editing', async () => {
        const { draft, preview } = await as('u_doc1').views.availability();

        expect(draft.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(draft.days[0]).toMatchObject({
            on: true,
            start: '09:00',
            end: '17:00',
            lunch: true,
        });
        expect(draft.days[6].on).toBe(false);
        expect(draft.blocked).toEqual([{ weekday: 1, time: '12:00' }]);
        expect(draft.timeOff).toHaveLength(1);
        // Monday: 9 to 17 is 16 half hours, minus lunch (2) and the blocked 12:00 (1).
        expect(preview.slotsPerWeekday[0]).toBe(13);
        expect(preview.total).toBe(
            preview.slotsPerWeekday.reduce((a, b) => a + b, 0),
        );
    });

    it('previews a change with the bookings it would strand, without saving it', async () => {
        const doctor = as('u_doc1');
        const { draft } = await doctor.views.availability();
        const tuesdayOff = {
            ...draft,
            days: draft.days.map((d) =>
                d.weekday === 2 ? { ...d, on: false } : d,
            ),
        };
        const preview = await doctor.doctors.previewAvailability(tuesdayOff);

        expect(preview.slotsPerWeekday[1]).toBe(0);
        expect(preview.affected.map((a) => a.appointmentId)).toContain('a_019');
        // Not saved.
        expect((await doctor.views.availability()).draft.days[1].on).toBe(true);
    });

    it('also flags bookings inside a new time-off range or blocked time', async () => {
        const doctor = as('u_doc1');
        const { draft } = await doctor.views.availability();
        const preview = await doctor.doctors.previewAvailability({
            ...draft,
            timeOff: [
                ...draft.timeOff,
                {
                    id: null,
                    startDate: '2026-10-27',
                    endDate: '2026-10-27',
                    reason: 'Leave',
                },
            ],
        });

        expect(preview.affected.map((a) => a.appointmentId)).toContain('a_019');
    });

    it('saves the draft, and the slot generator follows it', async () => {
        const doctor = as('u_doc1');
        const { draft } = await doctor.views.availability();

        await doctor.doctors.saveAvailability({
            ...draft,
            days: draft.days.map((d) =>
                d.weekday === 3 ? { ...d, on: false } : d,
            ),
            blocked: [...draft.blocked, { weekday: 4, time: '09:00' }],
        });

        const reception = as('u_recep');

        expect(
            await reception.slots.list({
                doctorId: 'd_sana',
                serviceId: 's_general',
                date: '2026-10-28',
            }),
        ).toEqual([]);
        const thursday = await reception.slots.list({
            doctorId: 'd_sana',
            serviceId: 's_general',
            date: '2026-10-29',
        });

        expect(
            thursday.some((s) => s.startsAt === '2026-10-29T04:00:00.000Z'),
        ).toBe(false);
        expect((await doctor.views.availability()).draft.days[2].on).toBe(
            false,
        );
    });

    it('rejects hours that do not make sense', async () => {
        const doctor = as('u_doc1');
        const { draft } = await doctor.views.availability();

        await expect(
            doctor.doctors.saveAvailability({
                ...draft,
                days: draft.days.map((d, i) =>
                    i === 0 ? { ...d, start: '17:00', end: '09:00' } : d,
                ),
            }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'days' });
        await expect(
            doctor.doctors.saveAvailability({
                ...draft,
                timeOff: [
                    {
                        id: null,
                        startDate: '2026-11-05',
                        endDate: '2026-11-01',
                        reason: '',
                    },
                ],
            }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'timeOff' });
    });
});

describe('reschedule requests', () => {
    it('lists what is waiting and the history', async () => {
        const view = await as('u_doc1').views.requests();

        expect(view.pending.map((r) => r.request.id)).toEqual(['rq_2', 'rq_1']);
        expect(view.history.map((r) => r.request.status).sort()).toEqual([
            'approved',
            'rejected',
        ]);
        expect(view.pending[0].row.patient.name).toBeTruthy();
    });

    it('approving moves the appointment and records the message', async () => {
        const doctor = as('u_doc1');
        const decided = await doctor.requests.decide('rq_1', {
            decision: 'approved',
            message: '  See you then  ',
        });
        const moved = await doctor.appointments.get('a_019');

        expect(decided).toMatchObject({
            status: 'approved',
            message: 'See you then',
        });
        expect(moved.startsAt).toBe(decided.proposedStartsAt);
        expect((await doctor.views.doctorShell()).pendingRequests).toBe(1);
    });

    it('rejecting keeps the appointment where it was', async () => {
        const doctor = as('u_doc1');
        const before = (await doctor.appointments.get('a_020')).startsAt;

        await doctor.requests.decide('rq_2', { decision: 'rejected' });

        expect((await doctor.appointments.get('a_020')).startsAt).toBe(before);
    });

    it('cannot be decided twice, nor by another doctor', async () => {
        await as('u_doc1').requests.decide('rq_1', { decision: 'rejected' });

        await expect(
            as('u_doc1').requests.decide('rq_1', { decision: 'approved' }),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
        await expect(
            as('u_doc2').requests.decide('rq_2', { decision: 'approved' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('answers with alternatives when the requested time was taken meanwhile', async () => {
        const request = (await as('u_doc1').views.requests()).pending.find(
            (r) => r.request.id === 'rq_1',
        )!.request;

        await as('u_recep').appointments.create({
            patientId: 'p_1',
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: request.proposedStartsAt,
            source: 'manual',
        });

        await expect(
            as('u_doc1').requests.decide('rq_1', { decision: 'approved' }),
        ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
        // Nothing changed: still waiting.
        expect((await as('u_doc1').views.doctorShell()).pendingRequests).toBe(
            2,
        );
    });
});
