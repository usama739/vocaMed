import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
    gotoIn,
    setLocaleCookie,
    sidewaysOverflow,
    smallTargets,
    watchConsole,
    type Locale,
} from './helpers';

// Clinic admin: Doctors (D2) and Doctor profile (D3). Reduced motion keeps screenshots and
// measurements deterministic. The in-browser mock is seeded relative to "now", so every test
// starts on Monday 10:15 in Karachi.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/clinic-admin';
mkdirSync(SHOTS, { recursive: true });

const PAGES: {
    name: string;
    path: string;
    h1: Record<Locale, string>;
    ready: (page: import('@playwright/test').Page) => Promise<void>;
}[] = [
    {
        name: 'doctors',
        path: url('/admin/doctors'),
        h1: { en: 'Doctors', ur: 'ڈاکٹرز' },
        ready: async (page) => {
            await expect(page.locator('[data-doctor]').first()).toBeVisible();
        },
    },
    {
        name: 'doctor',
        path: url('/admin/doctors/d_sana'),
        h1: { en: 'Dr. Sana Malik', ur: 'Dr. Sana Malik' },
        ready: async (page) => {
            await expect(page.locator('[data-weekday]').first()).toBeVisible();
            await expect(
                page.locator('aside[aria-labelledby="preview-title"]'),
            ).toContainText(/\d/);
        },
    },
    {
        name: 'doctor-new',
        path: url('/admin/doctors/new'),
        h1: { en: 'Add doctor', ur: 'ڈاکٹر شامل کریں' },
        ready: async (page) => {
            await expect(page.locator('[data-weekday]').first()).toBeVisible();
        },
    },
];

test.describe('every page, in both languages', () => {
    for (const locale of ['en', 'ur'] as const) {
        for (const spec of PAGES) {
            test(`${spec.name} (${locale}): loads clean, mirrors, fits, has 44px targets`, async ({
                page,
                baseURL,
            }) => {
                const problems = watchConsole(page);
                await setLocaleCookie(page, baseURL!, locale);

                for (const width of [1440, 820, 390]) {
                    await page.setViewportSize({ width, height: 900 });
                    await page.goto(spec.path, {
                        waitUntil: 'domcontentloaded',
                    });

                    await expect(page.locator('html')).toHaveAttribute(
                        'lang',
                        locale,
                    );
                    await expect(page.locator('html')).toHaveAttribute(
                        'dir',
                        locale === 'ur' ? 'rtl' : 'ltr',
                    );
                    await expect(
                        page.getByRole('heading', { level: 1 }),
                    ).toHaveText(spec.h1[locale]);
                    await spec.ready(page);
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(500);

                    await page.evaluate(() => document.fonts.ready);
                    await page.screenshot({
                        path: `${SHOTS}/${spec.name}-${locale}-${width}.png`,
                        fullPage: true,
                    });

                    expect(
                        await sidewaysOverflow(page),
                        `${spec.name} ${locale} ${width}px sideways overflow`,
                    ).toBeLessThanOrEqual(0);
                    expect(
                        await smallTargets(page),
                        `${spec.name} ${locale} ${width}px small targets`,
                    ).toEqual([]);
                }

                expect(problems).toEqual([]);
            });
        }
    }
});

test.describe('Doctors', () => {
    test('searches, filters and deactivates with a confirm that explains what happens', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/doctors'), 'en');
        await expect(page.getByText('Showing 3 of 3 doctors')).toBeVisible();

        await page
            .getByRole('searchbox', { name: 'Search doctors' })
            .fill('paed');
        await expect(page.getByText('Showing 1 of 3 doctors')).toBeVisible();
        await expect(page.locator('[data-doctor]')).toHaveCount(1);
        await page.getByRole('searchbox', { name: 'Search doctors' }).fill('');
        await expect(page.locator('[data-doctor]')).toHaveCount(3);

        await page
            .getByRole('button', { name: 'Deactivate Dr. Imran Qureshi' })
            .click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText('Deactivate Dr. Imran Qureshi?');
        await expect(dialog).toContainText(/calendar/);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();

        await page
            .getByRole('button', { name: 'Deactivate Dr. Imran Qureshi' })
            .click();
        await dialog.getByRole('button', { name: 'Deactivate' }).click();
        await expect(
            page.getByRole('button', { name: 'Reactivate Dr. Imran Qureshi' }),
        ).toBeVisible();

        await page
            .getByRole('combobox', { name: 'Filter by status' })
            .selectOption('active');
        await expect(page.locator('[data-doctor]')).toHaveCount(2);
    });

    test('shows the forced states', async ({ page }) => {
        await gotoIn(page, url('/admin/doctors?state=empty'), 'en');
        await expect(page.getByText('No doctors yet')).toBeVisible();

        await gotoIn(page, url('/admin/doctors?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );

        await gotoIn(page, url('/admin/doctors?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
    });
});

test.describe('Doctor profile', () => {
    test('adds a doctor, saves, and finds them in the list', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/doctors'), 'en');
        await page.getByRole('link', { name: 'Add doctor' }).first().click();
        await expect(page).toHaveURL(/\/admin\/doctors\/new/);

        await page
            .getByRole('textbox', { name: 'Name' })
            .fill('Dr. Zara Ahmed');
        await page.getByRole('textbox', { name: 'Specialty' }).fill('ENT');
        await page.getByRole('button', { name: 'Punjabi' }).click();
        await page.getByRole('button', { name: 'Add doctor' }).click();

        await expect(page).toHaveURL(/\/admin\/doctors\/d_\d+/);
        await expect(
            page.getByRole('heading', { level: 1, name: 'Dr. Zara Ahmed' }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Punjabi' }),
        ).toHaveAttribute('aria-pressed', 'true');

        await page.getByRole('link', { name: 'Doctors' }).first().click();
        await expect(page.getByText('Dr. Zara Ahmed')).toBeVisible();
    });

    test('a change updates the preview and warns about bookings, then saves', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/doctors/d_sana'), 'en');
        const preview = page.locator('aside[aria-labelledby="preview-title"]');

        await expect(preview.getByText('13 slots')).toBeVisible();
        await page.getByRole('switch', { name: 'Tuesday' }).click();
        await expect(page.getByRole('alert')).toContainText(
            'This change affects existing bookings',
        );
        await page
            .getByRole('textbox', { name: 'Name' })
            .fill('Dr. Sana M. Malik');
        await expect(page.getByText('Unsaved changes').first()).toBeVisible();

        await page.getByRole('button', { name: 'Save anyway' }).click();
        await expect(page.getByText('Changes saved').first()).toBeVisible();
        await expect(page.getByText('Unsaved changes')).toBeHidden();
    });

    test('invites a doctor to sign in', async ({ page }) => {
        await gotoIn(page, url('/admin/doctors/d_hina'), 'en');

        await page
            .getByRole('textbox', { name: 'Doctor’s email' })
            .fill('hina@shifa.example');
        await page.getByRole('button', { name: 'Invite to sign in' }).click();

        await expect(
            page.getByText('Invitation sent to hina@shifa.example.').first(),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Resend invite' }),
        ).toBeVisible();
    });

    test('says when the doctor does not exist', async ({ page }) => {
        await gotoIn(page, url('/admin/doctors/d_missing'), 'en');
        await expect(page.getByText('We could not find that')).toBeVisible();
    });

    test('keyboard: the active switch works with Space', async ({ page }) => {
        await gotoIn(page, url('/admin/doctors/d_hina'), 'en');
        const toggle = page.getByRole('switch', { name: 'Accepting bookings' });
        await toggle.focus();
        await page.keyboard.press('Space');

        // Dr. Hina has upcoming appointments, so taking her off booking asks first.
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Stop bookings' })
            .click();
        await expect(
            page.getByRole('switch', { name: 'Not accepting bookings' }),
        ).not.toBeChecked();
    });
});
