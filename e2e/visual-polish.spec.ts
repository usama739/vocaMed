import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
    gotoIn,
    sidewaysOverflow,
    smallTargets,
    watchConsole,
} from './helpers';

// Before/after evidence for the visual polish pass (docs/modules/visual-polish.md): every public and
// staff page in English and Urdu at three widths, with the checks that a restyle can break.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const SHOTS = 'storage/app/screenshots/visual-polish';
mkdirSync(SHOTS, { recursive: true });

const withNow = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const PUBLIC = [
    ['landing', '/'],
    ['login', '/login'],
    ['register', '/register'],
    ['forgot', '/forgot-password'],
    ['reset', '/reset-password/sample-valid'],
    ['invite', '/invite/sample-receptionist'],
    ['privacy', '/privacy'],
] as const;

const STAFF = [
    ['reception-today', '/reception'],
    ['reception-appointments', '/reception/appointments'],
    ['doctor-overview', '/doctor'],
    ['admin-overview', '/admin'],
    ['admin-doctors', '/admin/doctors'],
    ['account', '/account?role=clinic_admin'],
    ['patient-manage', '/p/sample-booked'],
] as const;

const WIDTHS = [1440, 820, 390];

function run(group: string, pages: readonly (readonly [string, string])[]) {
    test.describe(group, () => {
        for (const locale of ['en', 'ur'] as const) {
            for (const [name, path] of pages) {
                test(`${name} (${locale}): clean, fits, 44px targets`, async ({
                    page,
                }) => {
                    const problems = watchConsole(page);

                    for (const width of WIDTHS) {
                        await page.setViewportSize({ width, height: 900 });
                        await gotoIn(page, withNow(path), locale);
                        await expect(
                            page.getByRole('heading', { level: 1 }).first(),
                        ).toBeVisible();
                        await page.waitForLoadState('networkidle');
                        await page.evaluate(() => document.fonts.ready);
                        await page.screenshot({
                            path: `${SHOTS}/${name}-${locale}-${width}.png`,
                            fullPage: width === 1440 && group === 'public',
                        });

                        expect(
                            await sidewaysOverflow(page),
                            `${name} ${locale} ${width}px sideways overflow`,
                        ).toBeLessThanOrEqual(0);
                        expect(
                            await smallTargets(page),
                            `${name} ${locale} ${width}px small targets`,
                        ).toEqual([]);
                    }

                    expect(problems).toEqual([]);
                });
            }
        }
    });
}

run('public', PUBLIC);
run('staff', STAFF);
