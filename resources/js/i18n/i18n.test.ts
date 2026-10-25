import { describe, expect, it } from 'vitest';
import { directionOf, isLocale, LOCALES } from './locales';
import en from './messages/en';
import ur from './messages/ur';

const keys = (value: object, prefix = ''): string[] =>
    Object.entries(value).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
            ? keys(v, `${prefix}${k}.`)
            : [`${prefix}${k}`],
    );

describe('locales', () => {
    it('supports English (ltr) and Urdu (rtl)', () => {
        expect(LOCALES).toEqual(['en', 'ur']);
        expect(directionOf('en')).toBe('ltr');
        expect(directionOf('ur')).toBe('rtl');
        expect(isLocale('ur')).toBe(true);
        expect(isLocale('fr')).toBe(false);
    });

    it('has the same keys in both languages and no empty strings', () => {
        expect(keys(ur).sort()).toEqual(keys(en).sort());
        expect(
            keys(ur).every(
                (k) =>
                    k
                        .split('.')
                        .reduce<unknown>(
                            (o, p) => (o as Record<string, unknown>)[p],
                            ur,
                        ) !== '',
            ),
        ).toBe(true);
    });
});
