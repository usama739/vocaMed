// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isEmail, meetsPasswordRule, passwordStrength } from './validation';

describe('validation', () => {
    it('accepts ordinary e-mail addresses and rejects malformed ones', () => {
        expect(isEmail('name@yourclinic.com')).toBe(true);
        expect(isEmail('  name@yourclinic.com  ')).toBe(true);

        for (const bad of [
            '',
            'name',
            'name@',
            '@clinic.com',
            'a b@c.com',
            'a@b',
        ]) {
            expect(isEmail(bad), bad).toBe(false);
        }
    });

    it('requires 10+ characters with letters and numbers', () => {
        expect(meetsPasswordRule('abcdefghij')).toBe(false);
        expect(meetsPasswordRule('1234567890')).toBe(false);
        expect(meetsPasswordRule('abcdefgh1')).toBe(false);
        expect(meetsPasswordRule('abcdefghi1')).toBe(true);
        expect(meetsPasswordRule('پاسورڈ1234567')).toBe(true);
    });

    it('scores strength as the design does', () => {
        expect(passwordStrength('')).toBe(0);
        expect(passwordStrength('abc')).toBe(1);
        expect(passwordStrength('abcdefgh1')).toBe(1);
        expect(passwordStrength('abcdefghi1')).toBe(2);
        expect(passwordStrength('abcdefghijkl12')).toBe(2);
        expect(passwordStrength('abcdefghijkl1!')).toBe(3);
    });
});
