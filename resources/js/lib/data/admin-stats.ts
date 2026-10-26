import { addDays, weekdayOf } from './time';
import type { Id, IsoDate } from './types';
import type { AdminOverviewView, AdminPeriod, KpiValue } from './views';

/**
 * Sample statistics for the admin Overview. The real backend answers these with aggregate queries
 * over appointments and notifications; the 24 sample appointments cannot, so the mock generates a
 * stable series instead (the same date always gives the same numbers). The shape is the real one.
 */

const hash = (text: string): number => {
    let h = 2166136261;

    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return (h >>> 0) % 1000;
};

const dayNumber = (date: IsoDate) => {
    const [y, m, d] = date.split('-').map(Number);

    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

const monthStart = (date: IsoDate) => `${date.slice(0, 8)}01`;

const mondayOf = (date: IsoDate) => {
    const weekday = weekdayOf(date);

    return addDays(date, -((weekday + 6) % 7));
};

const range = (from: IsoDate, length: number) =>
    Array.from({ length }, (_, i) => addDays(from, i));

/** A clinic open Monday to Friday, half a day on Saturday, closed on Sunday, growing slowly. */
const dayCount = (date: IsoDate, today: IsoDate): number => {
    const base = [0, 22, 24, 23, 24, 22, 11][weekdayOf(date)];

    if (base === 0) {
        return 0;
    }

    const growth = 1 + 0.0025 * (dayNumber(date) - dayNumber(today));
    const jitter = (hash(date) % 7) - 3;

    return Math.max(0, Math.round(base * growth + jitter));
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const one = (value: number) => Math.round(value * 10) / 10;

export function periodRanges(period: AdminPeriod, today: IsoDate) {
    if (period === 'last7') {
        return {
            from: addDays(today, -6),
            to: today,
            previousFrom: addDays(today, -13),
            previousTo: addDays(today, -7),
            length: 7,
        };
    }

    if (period === 'month') {
        const from = monthStart(today);
        const length = Number(today.slice(8, 10));
        const previousFrom = monthStart(addDays(from, -1));

        return {
            from,
            to: today,
            previousFrom,
            previousTo: addDays(previousFrom, length - 1),
            length,
        };
    }

    // Three months: thirteen whole weeks ending with the current one.
    const from = addDays(mondayOf(today), -12 * 7);
    const length = dayNumber(today) - dayNumber(from) + 1;

    return {
        from,
        to: today,
        previousFrom: addDays(from, -length),
        previousTo: addDays(from, -1),
        length,
    };
}

export type SampleStats = Pick<
    AdminOverviewView,
    | 'period'
    | 'kpis'
    | 'trend'
    | 'weekdays'
    | 'outcomes'
    | 'sources'
    | 'doctorUse'
    | 'services'
>;

export function generateStats(
    period: AdminPeriod,
    today: IsoDate,
    doctors: { id: Id; name: string }[],
    services: { id: Id; name: string }[],
): SampleStats {
    const r = periodRanges(period, today);
    const current = range(r.from, r.length).map((d) => dayCount(d, today));
    const previous = range(r.previousFrom, r.length).map((d) =>
        dayCount(d, today),
    );

    const weekly = period === 'last3months';
    const bucket = (values: number[], start: IsoDate) =>
        weekly
            ? Array.from({ length: 13 }, (_, i) => ({
                  date: addDays(start, i * 7),
                  count: sum(values.slice(i * 7, i * 7 + 7)),
              }))
            : values.map((count, i) => ({ date: addDays(start, i), count }));
    const cur = bucket(current, r.from);
    const prev = bucket(previous, r.previousFrom);

    const booked = sum(current);
    const bookedPrevious = sum(previous);
    const seed = `${period}:${today}`;
    const jitter = (key: string, spread: number) =>
        ((hash(`${seed}:${key}`) % 100) / 100) * spread;

    const cancellation = one(8.6 + jitter('c', 1.4));
    const cancellationPrev = one(cancellation + 0.8 + jitter('cp', 1.2));
    const noShow = one(5.9 + jitter('n', 1.2));
    const noShowPrev = one(noShow + 0.7 + jitter('np', 1.1));
    const upcoming = Math.round(dayCount(today, today) * 0.8);
    const cancelled = Math.round((booked * cancellation) / 100);
    const noShows = Math.round((booked * noShow) / 100);
    const done = Math.max(0, booked - cancelled - noShows - upcoming);
    const donePrevious = Math.max(
        0,
        Math.round(
            bookedPrevious * (1 - (cancellationPrev + noShowPrev) / 100),
        ),
    );

    const kpi = (value: number, before: number): KpiValue => ({
        value,
        previous: before,
    });

    const voiceShare = 0.55 + jitter('v', 0.06);
    const voice = Math.round(booked * voiceShare);

    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
    range(r.from, r.length).forEach((date, i) => {
        weekdayTotals[(weekdayOf(date) + 6) % 7] += current[i];
    });

    const use = [0.85, 0.78, 0.72, 0.66, 0.6];
    const shownDoctors = doctors.slice(0, 5);
    const useTotal = sum(use.slice(0, shownDoctors.length));
    const serviceShares = [0.46, 0.31, 0.23];
    const shownServices = services.slice(0, 3);
    const shareTotal = sum(serviceShares.slice(0, shownServices.length));

    return {
        period: {
            id: period,
            from: r.from,
            to: r.to,
            previousFrom: r.previousFrom,
            previousTo: r.previousTo,
        },
        kpis: {
            booked: kpi(booked, bookedPrevious),
            done: kpi(done, donePrevious),
            cancellationRate: kpi(cancellation, cancellationPrev),
            noShowRate: kpi(noShow, noShowPrev),
            newPatients: kpi(
                Math.round(booked * 0.18),
                Math.round(bookedPrevious * 0.16),
            ),
            reminderDelivery: kpi(
                one(95.5 + jitter('r', 2.5)),
                one(94.5 + jitter('rp', 2.5)),
            ),
            confirmed: kpi(one(67 + jitter('k', 5)), one(62 + jitter('kp', 5))),
            doctorTimeUsed: kpi(
                one(75 + jitter('u', 5)),
                one(71 + jitter('up', 5)),
            ),
        },
        trend: {
            granularity: weekly ? 'week' : 'day',
            points: cur.map((point, i) => ({
                date: point.date,
                current: point.count,
                previous: prev[i].count,
            })),
        },
        weekdays: weekdayTotals,
        outcomes: { done, upcoming, cancelled, noShow: noShows },
        sources: { voice, manual: booked - voice },
        doctorUse: shownDoctors.map((doctor, i) => ({
            doctorId: doctor.id,
            name: doctor.name,
            utilisation: use[i],
            booked: Math.round((booked * use[i]) / useTotal),
        })),
        services: shownServices.map((service, i) => ({
            serviceId: service.id,
            name: service.name,
            share: serviceShares[i] / shareTotal,
            booked: Math.round((booked * serviceShares[i]) / shareTotal),
        })),
    };
}
