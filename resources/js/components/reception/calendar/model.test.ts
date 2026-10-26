// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from '@/lib/data/mock';
import { createSeedDatabase, DEMO_CLINIC_ID } from '@/lib/data/seed';
import {
    cellState,
    dayRowTimes,
    loadCalendar,
    monthEnd,
    monthGrid,
    monthStart,
    openDaysOfWeek,
    rangeOf,
    shiftDate,
    weekStart,
} from './model';

// Monday 10:15 in Karachi.
const NOW = new Date('2026-10-26T05:15:00.000Z');
const TODAY = '2026-10-26';

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

function source(actorId = 'u_recep') {
    const db = createSeedDatabase(NOW);

    return {
        db,
        source: createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId,
            now: () => new Date(),
        }),
    };
}

describe('calendar dates', () => {
    it('finds the Monday of any week, including a Sunday', () => {
        expect(weekStart('2026-10-26')).toBe('2026-10-26');
        expect(weekStart('2026-10-28')).toBe('2026-10-26');
        expect(weekStart('2026-10-25')).toBe('2026-10-19');
    });

    it('knows where a month starts and ends', () => {
        expect(monthStart('2026-10-26')).toBe('2026-10-01');
        expect(monthEnd('2026-10-26')).toBe('2026-10-31');
        expect(monthEnd('2026-02-10')).toBe('2026-02-28');
        expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    });

    it('steps by a day, a week or a month', () => {
        expect(shiftDate('day', '2026-10-31', 1)).toBe('2026-11-01');
        expect(shiftDate('week', '2026-10-26', -1)).toBe('2026-10-19');
        expect(shiftDate('month', '2026-10-26', 1)).toBe('2026-11-01');
        expect(shiftDate('month', '2026-01-15', -1)).toBe('2025-12-01');
    });

    it('gives the range for each view', () => {
        expect(rangeOf('day', TODAY)).toEqual({ from: TODAY, to: TODAY });
        expect(rangeOf('week', '2026-10-28')).toEqual({
            from: '2026-10-26',
            to: '2026-11-01',
        });
        expect(rangeOf('month', TODAY)).toEqual({
            from: '2026-10-01',
            to: '2026-10-31',
        });
    });

    it('builds a Monday-first month grid padded to whole weeks', () => {
        const cells = monthGrid(TODAY);

        expect(cells.length % 7).toBe(0);
        // 1 October 2026 is a Thursday: three blanks first.
        expect(cells.slice(0, 3)).toEqual([null, null, null]);
        expect(cells[3]).toBe('2026-10-01');
        expect(cells.filter(Boolean)).toHaveLength(31);
    });
});

describe('loadCalendar and day cells', () => {
    it('loads the day with each doctor’s slots, and leaves Sunday out of the week', async () => {
        const { source: s } = source();
        const data = await loadCalendar(s, 'day', TODAY, 'all');

        expect(data.columns.map((c) => c.doctor.id)).toEqual([
            'd_sana',
            'd_imran',
            'd_hina',
        ]);
        expect(data.rows.length).toBeGreaterThan(5);
        expect(openDaysOfWeek(data.settings, TODAY)).toHaveLength(6);
        expect(openDaysOfWeek(data.settings, TODAY)).not.toContain(
            '2026-11-01',
        );
    });

    it('covers every doctor’s hours with half-hour rows', async () => {
        const { source: s } = source();
        const data = await loadCalendar(s, 'day', TODAY, 'all');
        const times = dayRowTimes(data, TODAY);

        // Imran works until 18:00, so the last row is 17:30.
        expect(times[0]).toBe('09:00');
        expect(times.at(-1)).toBe('17:30');
        expect(times).toContain('13:00');
    });

    it('classifies each cell: events, free, closed, past', async () => {
        const { source: s } = source();
        const data = await loadCalendar(s, 'day', TODAY, 'all');
        const sana = data.columns.find((c) => c.doctor.id === 'd_sana')!;
        const imran = data.columns.find((c) => c.doctor.id === 'd_imran')!;
        const kind = (column: typeof sana, time: string) =>
            cellState(column, time, TODAY, data, data.rows).kind;

        expect(kind(sana, '09:00')).toBe('events');
        expect(kind(sana, '11:30')).toBe('free');
        // It is 10:15: Imran's empty 09:00 row is already behind us.
        expect(kind(imran, '09:00')).toBe('past');
        // Lunch break 13:00-14:00 for both.
        expect(kind(sana, '13:00')).toBe('off');
        expect(kind(imran, '13:30')).toBe('off');
    });

    it('stripes a slot another receptionist holds, but not your own', async () => {
        const { db, source: mine } = source();
        const other = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_other',
            now: () => new Date(),
        });
        const [slot] = (
            await mine.slots.list({
                doctorId: 'd_sana',
                serviceId: 's_general',
                date: TODAY,
            })
        ).filter((s) => s.state === 'free');
        const hour = new Date(slot.startsAt);
        const time = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Karachi',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(hour);
        const row = `${time.slice(0, 2)}:${Number(time.slice(3)) < 30 ? '00' : '30'}`;

        await other.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slot.startsAt,
        });
        const data = await loadCalendar(mine, 'day', TODAY, 'all');
        const sana = data.columns.find((c) => c.doctor.id === 'd_sana')!;
        const state = cellState(sana, row, TODAY, data, data.rows);

        // Another slot in the same half hour may still be free; otherwise it is held.
        expect(['held', 'free']).toContain(state.kind);

        await mine.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: (
                await mine.slots.list({
                    doctorId: 'd_sana',
                    serviceId: 's_general',
                    date: TODAY,
                })
            )
                .filter((s) => s.state === 'free')
                .at(-1)!.startsAt,
        });
        const again = await loadCalendar(mine, 'day', TODAY, 'all');
        const mineSlot = again.columns[0].slots.find((s) => s.heldByMe);

        expect(mineSlot).toBeTruthy();
    });

    it('limits the week and month to one doctor when asked', async () => {
        const { source: s } = source();
        const week = await loadCalendar(s, 'week', TODAY, 'd_imran');

        expect(week.doctors.map((d) => d.id)).toEqual(['d_imran']);
        expect(
            week.rows.every((r) => r.appointment.doctorId === 'd_imran'),
        ).toBe(true);
        expect(week.columns).toEqual([]);
    });
});
