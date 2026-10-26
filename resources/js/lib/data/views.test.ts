// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from './mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from './seed';
import type { DataSource } from './source';

// Monday 10:15 in Karachi.
const NOW = new Date('2026-10-26T05:15:00.000Z');
const TODAY = '2026-10-26';

const as = (actorId: string): DataSource =>
    createMockDataSource(createSeedDatabase(NOW), {
        clinicId: DEMO_CLINIC_ID,
        actorId,
        now: () => new Date(),
    });

let source: DataSource;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    source = as('u_recep');
});

afterEach(() => {
    vi.useRealTimers();
});

describe('page views', () => {
    it('today: one payload with every doctor’s day, joined and ready to draw', async () => {
        const view = await source.views.today();

        expect(view.today).toBe(TODAY);
        expect(view.days.map((d) => d.doctor.id)).toEqual([
            'd_sana',
            'd_imran',
            'd_hina',
        ]);

        const row = view.days[0].rows.find(
            (r) => r.appointment.id === 'a_004',
        )!;

        expect(row.patient.name).toBe('Zainab Hussain');
        expect(row.service.name).toBe('General consultation');
        expect(row.createdBy).toEqual({ kind: 'user', name: 'Bilal Ahmed' });
    });

    it('carries what the server allows, so the client does not re-derive it', async () => {
        const view = await source.views.today();
        const rows = view.days.flatMap((d) => d.rows);
        const booked = rows.find((r) => r.appointment.status === 'booked')!;
        const done = rows.find((r) => r.appointment.status === 'done')!;

        expect(booked.allowed.canCancel).toBe(true);
        expect(booked.allowed.transitions).toContain('arrived');
        expect(done.allowed.transitions).toEqual([]);
        expect(done.allowed.canReschedule).toBe(false);
        expect(done.allowed.canUndo).toBe(true);
    });

    it('limits a doctor to starting and finishing their own consultations', async () => {
        const view = await as('u_doc1').views.today();
        const rows = view.days.flatMap((d) => d.rows);
        const arrived = rows.find((r) => r.appointment.status === 'arrived')!;
        const booked = rows.find((r) => r.appointment.status === 'booked')!;

        expect(arrived.allowed.transitions.sort()).toEqual([
            'done',
            'in_consultation',
        ]);
        expect(arrived.allowed.canCancel).toBe(false);
        expect(booked.allowed.transitions).toEqual([]);
    });

    it('appointments: filters, sorts and pages on the server side', async () => {
        const first = await source.views.appointments({
            when: 'any',
            sort: 'desc',
            page: 1,
            perPage: 10,
        });

        expect(first.page.total).toBeGreaterThan(20);
        expect(first.page.items).toHaveLength(10);
        expect(first.doctors).toHaveLength(3);

        const week = await source.views.appointments({
            when: 'next7',
            sort: 'asc',
            page: 1,
        });

        expect(
            week.page.items.every(
                (r) => r.appointment.startsAt >= '2026-10-25T19:00',
            ),
        ).toBe(true);

        const search = await source.views.appointments({
            when: 'any',
            q: 'zainab',
            sort: 'desc',
            page: 1,
        });

        expect(
            search.page.items.every((r) => r.patient.name === 'Zainab Hussain'),
        ).toBe(true);
    });

    it('appointment: detail with history and timeline, or null when it does not exist', async () => {
        const view = await source.views.appointment('a_004');

        expect(view?.row.doctor.name).toBe('Dr. Sana Malik');
        expect(view?.timeline.length).toBeGreaterThan(1);
        expect(view?.history.map((h) => h.actor.kind)).toEqual([
            'patient',
            'user',
        ]);
        expect(await source.views.appointment('a_999')).toBeNull();
    });

    it('calendar: resolves the date, joins events and gives each doctor’s slots for the day', async () => {
        const view = await source.views.calendar({
            view: 'day',
            date: null,
            doctorId: 'all',
        });

        expect(view.date).toBe(TODAY);
        expect(view.allDoctors).toHaveLength(3);
        expect(view.columns).toHaveLength(3);
        expect(view.rows.length).toBeGreaterThan(5);

        const one = await source.views.calendar({
            view: 'week',
            date: TODAY,
            doctorId: 'd_imran',
        });

        expect(one.doctors.map((d) => d.id)).toEqual(['d_imran']);
        expect(one.allDoctors).toHaveLength(3);
        expect(one.columns).toEqual([]);
    });

    it('patients and patient: last and next visit, null for a missing patient', async () => {
        const list = await source.views.patients({ q: '' });
        const found = await source.views.patients({ q: '0345 1234570' });

        expect(list.rows.length).toBeGreaterThan(3);
        expect(found.rows.map((r) => r.patient.name)).toEqual([
            'Zainab Hussain',
        ]);
        expect(found.rows[0].next).toContain('2026-10-26');

        const detail = await source.views.patient('p_4');

        expect(detail?.appointments.length).toBeGreaterThan(0);
        expect(await source.views.patient('p_999')).toBeNull();
    });

    it('notifications: the log with each patient attached', async () => {
        const view = await source.views.notifications();

        expect(view.rows.length).toBeGreaterThan(10);
        expect(view.rows.every((r) => r.patient)).toBe(true);
    });

    it('returns copies, so a page cannot change the stored data', async () => {
        const view = await source.views.today();
        view.days[0].rows[0].patient.name = 'Changed';

        expect(
            (await source.views.today()).days[0].rows[0].patient.name,
        ).not.toBe('Changed');
    });
});
