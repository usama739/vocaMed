import { describe, expect, it } from 'vitest';
import {
    areaPath,
    axisIndexes,
    chartTop,
    chartX,
    chartY,
    formatDelta,
    kpiDelta,
    linePath,
    trendLabel,
} from './model';

describe('how a number moved', () => {
    it('is a percent for a count and points for a rate', () => {
        expect(kpiDelta(110, 100, { points: false })).toMatchObject({
            diff: 10,
            direction: 'up',
            tone: 'good',
        });
        expect(
            kpiDelta(9.1, 10.4, { points: true, lowerIsBetter: true }),
        ).toMatchObject({
            diff: -1.3,
            direction: 'down',
            tone: 'good',
        });
        expect(
            kpiDelta(8, 7, { points: true, lowerIsBetter: true }),
        ).toMatchObject({
            tone: 'bad',
        });
    });

    it('is flat when nothing changed and absent with nothing to compare', () => {
        expect(kpiDelta(5, 5, { points: false })).toMatchObject({
            diff: 0,
            tone: 'flat',
            direction: 'flat',
        });
        expect(kpiDelta(0, 0, { points: false })).toMatchObject({
            tone: 'flat',
        });
        expect(kpiDelta(5, 0, { points: false })).toBeNull();
        // A rate can always be compared, even with a zero before.
        expect(kpiDelta(5, 0, { points: true })).toMatchObject({ diff: 5 });
    });

    it('is written with a real minus and the right unit', () => {
        expect(formatDelta(kpiDelta(120, 100, { points: false })!, 'pts')).toBe(
            '+20%',
        );
        expect(formatDelta(kpiDelta(9.1, 10.4, { points: true })!, 'pts')).toBe(
            '−1.3 pts',
        );
        expect(formatDelta(kpiDelta(5, 5, { points: false })!, 'pts')).toBe('');
    });
});

describe('chart geometry', () => {
    const points = [
        { date: '2026-10-01', current: 18, previous: 22 },
        { date: '2026-10-02', current: 45, previous: 30 },
    ];

    it('rounds the top tick up to a multiple of 20, with room above the highest point', () => {
        expect(chartTop(points)).toBe(60);
        expect(chartTop([{ date: 'x', current: 0, previous: 0 }])).toBe(20);
        expect(chartTop([{ date: 'x', current: 19, previous: 3 }])).toBe(20);
        expect(chartTop([{ date: 'x', current: 20, previous: 3 }])).toBe(40);
    });

    it('puts each point in the middle of its column, with the top of the scale at the top', () => {
        expect(chartX(0, 4)).toBe(12.5);
        expect(chartX(3, 4)).toBe(87.5);
        expect(chartY(0, 60)).toBe(100);
        expect(chartY(60, 60)).toBe(0);
    });

    it('builds a line and a closed area under it', () => {
        expect(linePath([30, 60], 60)).toBe('M25.00 50.00 L75.00 0.00');
        expect(areaPath([30, 60], 60)).toBe(
            'M25.00 50.00 L75.00 0.00 L75.00 100 L25.00 100 Z',
        );
        expect(areaPath([], 60)).toBe('');
    });

    it('labels about seven points on the axis', () => {
        expect(axisIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(axisIndexes(24)).toEqual([0, 4, 8, 12, 16, 20]);
        expect(axisIndexes(13)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    });
});

describe('axis labels', () => {
    it('are weekdays for a week, day numbers for a month and dates for three months', () => {
        expect(trendLabel('2026-10-26', 'last7', 'en')).toBe('Mon');
        expect(trendLabel('2026-10-05', 'month', 'en')).toBe('5');
        expect(trendLabel('2026-10-05', 'last3months', 'en')).toBe('5 Oct');
        // Latin digits in Urdu too.
        expect(trendLabel('2026-10-05', 'month', 'ur')).toBe('5');
    });
});
