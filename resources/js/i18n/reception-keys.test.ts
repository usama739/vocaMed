// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './messages/en';
import ur from './messages/ur';

// `reception.*` and `doctor.*` keys are not checked by the compiler (see ReceptionT in scope.tsx), so this does
// it: every key written out in the source must exist in English and Urdu.
const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);

        if (statSync(path).isDirectory()) {
            return name === 'wayfinder' || name === 'routes'
                ? []
                : sources(path);
        }

        return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
}

const resolve = (tree: unknown, key: string): boolean => {
    const value = key
        .split('.')
        .reduce<unknown>(
            (node, part) =>
                node && typeof node === 'object'
                    ? (node as Record<string, unknown>)[part]
                    : undefined,
            tree,
        );

    return typeof value === 'string';
};

// Plural keys are written as `key_one` / `key_other` and used as `key`.
const exists = (tree: unknown, key: string) =>
    resolve(tree, key) ||
    (resolve(tree, `${key}_one`) && resolve(tree, `${key}_other`));

const used = new Map<string, string>();

for (const file of sources(ROOT)) {
    const text = readFileSync(file, 'utf8');

    for (const match of text.matchAll(
        /\bt\(\s*['`]((?:reception|doctor)\.[\w.]+)['`]/g,
    )) {
        used.set(match[1], file.replace(ROOT, ''));
    }
}

describe('reception copy', () => {
    it('finds the keys the pages use', () => {
        expect(used.size).toBeGreaterThan(100);
    });

    it.each([...used])('has %s in English and Urdu', (key, file) => {
        expect(
            exists(en, key),
            `${key} (used in ${file}) is missing in English`,
        ).toBe(true);
        expect(
            exists(ur, key),
            `${key} (used in ${file}) is missing in Urdu`,
        ).toBe(true);
    });

    it('has no English-only or Urdu-only keys', () => {
        const flat = (tree: unknown, prefix = ''): string[] =>
            Object.entries(tree as Record<string, unknown>).flatMap(
                ([name, value]) =>
                    typeof value === 'string'
                        ? [`${prefix}${name}`]
                        : flat(value, `${prefix}${name}.`),
            );

        expect(flat(ur.reception).sort()).toEqual(flat(en.reception).sort());
        expect(flat(ur.doctor).sort()).toEqual(flat(en.doctor).sort());
    });
});
