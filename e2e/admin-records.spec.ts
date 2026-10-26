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

// Clinic admin, the records pages: Notification templates and Audit log. Reduced motion keeps
// screenshots and measurements deterministic. The in-browser mock is seeded relative to "now", so
// every test starts on Monday 10:15 in Karachi.
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
    ready: string;
}[] = [
    {
        name: 'templates',
        path: url('/admin/templates'),
        h1: {
            en: 'Notification templates',
            ur: 'اطلاعی پیغامات کے سانچے',
        },
        ready: '[role=tablist]',
    },
    {
        name: 'audit',
        path: url('/admin/audit'),
        h1: { en: 'Audit log', ur: 'آڈٹ لاگ' },
        ready: '[role=table] [data-audit]',
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
                    await expect(page.locator(spec.ready).first()).toBeVisible({
                        timeout: 30_000,
                    });

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

test.describe('Notification templates', () => {
    test('keeps an unsaved draft for each message, inserts a variable at the cursor, and saves', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/templates'), 'en');
        const box = page.getByRole('textbox', { name: 'Message', exact: true });
        await expect(box).toBeVisible();

        // The cursor decides where the variable goes.
        await box.fill('Hi , see you');
        await box.evaluate((el: HTMLTextAreaElement) =>
            el.setSelectionRange(3, 3),
        );
        await page.getByRole('button', { name: '{patient_name}' }).click();
        await expect(box).toHaveValue('Hi {patient_name}, see you');
        const unsaved = page
            .getByRole('status')
            .filter({ hasText: 'Unsaved changes' });
        await expect(unsaved).toBeVisible();
        await expect(
            page.getByRole('tab', { name: 'Confirmation unsaved changes' }),
        ).toBeVisible();

        // Another message is another draft; the first one is still there when we come back.
        await page.getByRole('tab', { name: 'Cancellation' }).click();
        await expect(unsaved).toBeHidden();
        await page.getByRole('tab', { name: /^Confirmation/ }).click();
        await expect(box).toHaveValue('Hi {patient_name}, see you');

        await page.getByRole('button', { name: 'Save template' }).click();
        await expect(page.getByText('Template saved.')).toBeVisible();
        await expect(page.getByText('Customised')).toBeVisible();
        await expect(unsaved).toBeHidden();

        await page.getByRole('button', { name: 'Reset to default' }).click();
        await expect(page.getByText('Customised')).toBeHidden();
        await expect(box).toHaveValue(/is booked for \{time\}/);
    });

    test('checks the variables and the counter, and sends a test', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/templates'), 'en');
        const box = page.getByRole('textbox', { name: 'Message', exact: true });
        await expect(box).toBeVisible();

        await box.fill('Hello {nonsense}');
        await expect(page.getByRole('alert')).toContainText(
            'Unknown variable {nonsense}',
        );
        await expect(
            page.getByRole('button', { name: 'Save template' }),
        ).toBeDisabled();

        await box.fill('a'.repeat(161));
        await expect(
            page.getByText('161 characters · 2 message parts'),
        ).toBeVisible();

        await page.getByRole('button', { name: 'WhatsApp' }).click();
        await expect(page.getByRole('note')).toContainText('need approval');
        await expect(page.getByText(/message part/)).toBeHidden();

        await page.getByRole('button', { name: 'SMS' }).click();
        await box.fill('Hi {patient_name}');
        await page.getByLabel('Send to this phone').fill('0300 1234567');
        await page.getByRole('button', { name: 'Send test message' }).click();
        await expect(
            page.getByText('Test sent to +923001234567'),
        ).toBeVisible();
    });

    test('the Urdu message is right to left on an English page', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/templates'), 'en');
        await page
            .getByRole('group', { name: 'Message language' })
            .getByRole('button', { name: 'اردو' })
            .click();

        await expect(
            page.getByRole('textbox', { name: 'Message', exact: true }),
        ).toHaveAttribute('dir', 'rtl');
        await expect(
            page.getByRole('region', { name: 'Message preview' }),
        ).toHaveAttribute('dir', 'rtl');
    });

    test('shows loading and error on request', async ({ page }) => {
        await gotoIn(page, url('/admin/templates?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading the message templates' }),
        ).toBeVisible();

        await gotoIn(page, url('/admin/templates?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );
    });
});

test.describe('Audit log', () => {
    test('filters by date, user and action, keeps them in the address, and clears them', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/audit'), 'en');
        await expect(page.locator('[data-audit]').first()).toBeVisible();

        await page.getByRole('button', { name: 'Today' }).click();
        await expect(page).toHaveURL(/days=1/);

        await page
            .getByRole('group', { name: 'Action' })
            .getByRole('button', { name: 'Staff invited' })
            .click();
        await expect(page).toHaveURL(/action=invite/);
        await expect(
            page.getByText('No activity matches these filters'),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Last 30 days' }).click();
        await expect(page.locator('[data-audit]').first()).toBeVisible();
        await expect(page.locator('[data-audit]').first()).toContainText(
            'Invitation',
        );

        await page.getByRole('button', { name: 'Last 7 days' }).click();
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page).not.toHaveURL(/days=|action=/);
        await expect(
            page.getByRole('button', { name: 'Last 30 days' }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('pages through the log 25 entries at a time', async ({ page }) => {
        await gotoIn(page, url('/admin/audit'), 'en');
        await expect(page.locator('[data-audit]')).toHaveCount(25);

        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page).toHaveURL(/page=2/);
        await expect(page.getByText(/^Page 2 of/)).toBeVisible();
        await expect(page.locator('[data-audit]').first()).toBeVisible();
    });

    test('reads in Urdu', async ({ page }) => {
        await gotoIn(page, url('/admin/audit'), 'ur');
        await expect(page.locator('[data-audit]').first()).toBeVisible();

        await expect(page.getByText('صرف پڑھنے کے لیے')).toBeVisible();
        await expect(
            page.getByRole('table').getByText('سائن اِن').first(),
        ).toBeVisible();
    });

    test('shows loading, empty and error on request', async ({ page }) => {
        await gotoIn(page, url('/admin/audit?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading the audit log' }),
        ).toBeVisible();

        await gotoIn(page, url('/admin/audit?state=empty'), 'en');
        await expect(
            page.getByText('No activity matches these filters'),
        ).toBeVisible();

        await gotoIn(page, url('/admin/audit?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );
    });
});
