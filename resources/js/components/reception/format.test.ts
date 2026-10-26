// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    daysBetween,
    formatLongDate,
    formatPhone,
    formatShortDate,
    formatStamp,
    initialsOf,
    relativeDay,
} from './format';

describe('relativeDay', () => {
    const today = '2026-10-26';

    it('names today, tomorrow and yesterday, then counts days', () => {
        expect(relativeDay('2026-10-26', today).key).toBe('today');
        expect(relativeDay('2026-10-27', today).key).toBe('tomorrow');
        expect(relativeDay('2026-10-25', today).key).toBe('yesterday');
        expect(relativeDay('2026-10-31', today)).toEqual({
            key: 'inDays',
            count: 5,
        });
        expect(relativeDay('2026-10-19', today)).toEqual({
            key: 'daysAgo',
            count: 7,
        });
    });

    it('counts across a month boundary', () => {
        expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    });
});

describe('dates', () => {
    it('writes the long date with a comma, Latin digits in both languages', () => {
        expect(formatLongDate('2026-10-24', 'en')).toBe('Saturday, 24 October');
        expect(formatLongDate('2026-10-24', 'en', true)).toBe(
            'Saturday, 24 October 2026',
        );
        const ur = formatLongDate('2026-10-24', 'ur');

        expect(ur).toContain('24');
        expect(ur).toContain('،');
        expect(ur).not.toMatch(/[٠-٩۰-۹]/);
    });

    it('writes short dates and stamps in the clinic’s time zone', () => {
        expect(formatShortDate('2026-10-22', 'en')).toBe('22 Oct');
        expect(
            formatStamp('2026-10-22T09:02:00.000Z', 'Asia/Karachi', 'en'),
        ).toBe('22 Oct, 14:02');
    });
});

describe('initialsOf', () => {
    it('takes the first letters of up to two words, ignoring a title', () => {
        expect(initialsOf('Zainab Hussain')).toBe('ZH');
        expect(initialsOf('Dr. Sana Malik')).toBe('SM');
        expect(initialsOf('Bilqees')).toBe('B');
    });

    it('keeps Urdu names in Urdu script, spaced', () => {
        expect(initialsOf('زینب حسین')).toBe('ز ح');
        expect(initialsOf('ڈاکٹر رحمان')).toBe('ر');
    });

    it('never returns nothing', () => {
        expect(initialsOf('   ')).toBe('?');
    });
});

describe('formatPhone', () => {
    it('shows the clinic’s national style, and leaves other countries alone', () => {
        expect(formatPhone('+923331112233', '+92')).toBe('0333 1112233');
        expect(formatPhone('+447700900123', '+92')).toBe('+447700900123');
        expect(formatPhone('', '+92')).toBe('');
    });
});
