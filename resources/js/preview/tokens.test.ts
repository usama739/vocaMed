// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_GROUPS, RADII, SHADOWS, TYPE_SCALE } from './tokens';

const root = path.resolve(__dirname, '../../..');
const css = readFileSync(path.join(root, 'resources/css/app.css'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/design-tokens.md'), 'utf8');

const declared = (cssVar: string) =>
    new RegExp(`${cssVar}:\\s*([^;]+);`).exec(css)?.[1].trim().toLowerCase();

describe('design tokens stay in sync', () => {
    const colors = COLOR_GROUPS.flatMap((g) => g.tokens);

    it.each(colors.map((c) => [c.name, c] as const))(
        'colour %s matches app.css and the docs',
        (_name, token) => {
            expect(declared(token.cssVar)).toBe(token.hex);
            expect(docs.toLowerCase()).toContain(`\`${token.name}\``);
            expect(docs.toLowerCase()).toContain(token.hex);
        },
    );

    it('type scale, radii and shadows are declared and documented', () => {
        for (const step of TYPE_SCALE) {
            expect(declared(step.cssVar), step.cssVar).toBeDefined();
            expect(docs).toContain(step.cls);
        }

        for (const radius of RADII.filter((r) => r.cssVar)) {
            expect(declared(radius.cssVar), radius.cssVar).toBe(radius.px);
            expect(docs).toContain(radius.cls);
        }

        for (const shadow of SHADOWS) {
            expect(declared(shadow.cssVar), shadow.cssVar).toBe(
                shadow.value.toLowerCase(),
            );
            expect(docs).toContain(shadow.cls);
        }
    });

    it('has no colour in the components that is not a token (no hard-coded hex)', () => {
        const files = [
            'status-badge.tsx',
            'role-sidebar.tsx',
            'top-bar.tsx',
            'clinic-shell.tsx',
            'booking-panel.tsx',
            'data-table.tsx',
            'form-fields.tsx',
            'states.tsx',
            'toast.tsx',
            'confirm-dialog.tsx',
            'voice-capture-button.tsx',
            'choice-chip.tsx',
        ];

        for (const file of files) {
            const source = readFileSync(
                path.join(root, 'resources/js/components/vocamed', file),
                'utf8',
            );

            expect(source, file).not.toMatch(/#[0-9a-fA-F]{6}\b/);
        }
    });
});
