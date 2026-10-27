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

// Clinic admin setup pages: Staff, Services and Clinic settings. Reduced motion keeps screenshots
// and measurements deterministic. The in-browser mock is seeded relative to "now", so every test
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
    /** Present once the page's data has arrived (English names; Urdu waits for text). */
    ready: string;
}[] = [
    {
        name: 'staff',
        path: url('/admin/staff'),
        h1: { en: 'Staff', ur: 'عملہ' },
        ready: 'table',
    },
    {
        name: 'services',
        path: url('/admin/services'),
        h1: { en: 'Services', ur: 'سروسز' },
        ready: 'table',
    },
    {
        name: 'settings',
        path: url('/admin/settings'),
        h1: { en: 'Clinic settings', ur: 'کلینک کی سیٹنگز' },
        ready: 'Clinic name',
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

                    // The page's data has arrived when its main structure is there.
                    if (locale === 'en') {
                        await expect(
                            spec.ready === 'table'
                                ? page.getByRole('table')
                                : page.getByLabel(spec.ready),
                        ).toBeVisible();
                    } else {
                        await expect(page.getByRole('main')).toContainText(
                            /\S{3}/,
                        );
                        await page.waitForLoadState('networkidle');
                        await page.waitForTimeout(800);
                    }

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

test.describe('the shell', () => {
    test('shows the admin’s seven items with the active page marked', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/services'), 'en');
        const nav = page.getByRole('navigation', { name: 'Main menu' });

        // The admin's own pages (the top bar carries the link to the Receptionist Console).
        await expect(nav.locator('li a[href^="/admin"]')).toHaveCount(7);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(
            'Services',
        );
    });

    test('shows loading, error and reconnecting on request', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/staff?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading staff' }),
        ).toBeVisible();

        await gotoIn(page, url('/admin/staff?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );

        await gotoIn(page, url('/admin/staff?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
        await expect(page.getByRole('table')).toBeVisible();
    });
});

test.describe('Staff', () => {
    test('invites someone, and refuses an address already in use', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/staff'), 'en');
        await page.getByRole('button', { name: 'Invite staff' }).click();
        const dialog = page.getByRole('dialog');

        await dialog.getByLabel('Email').fill('bilal@shifa.example');
        await dialog.getByRole('button', { name: 'Send invitation' }).click();
        await expect(dialog).toContainText('That email is already in use.');

        await dialog.getByLabel('Email').fill('new.desk@shifa.example');
        await dialog.getByRole('radio', { name: 'Clinic admin' }).check();
        await dialog.getByRole('button', { name: 'Send invitation' }).click();

        await expect(
            page.getByText('Invitation sent to new.desk@shifa.example'),
        ).toBeVisible();
        await expect(
            page.getByRole('table').getByText('new.desk@shifa.example'),
        ).toBeVisible();
    });

    test('resends, revokes after a confirm, and deactivates then reactivates', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/staff'), 'en');

        await page
            .getByRole('button', {
                name: 'Resend invite to weekend.desk@shifa.example',
            })
            .click();
        await expect(
            page.getByText('Invitation resent to weekend.desk@shifa.example'),
        ).toBeVisible();

        await page
            .getByRole('button', {
                name: 'Revoke invite to newdesk@shifa.example',
            })
            .click();
        await expect(page.getByRole('alertdialog')).toContainText(
            'The link sent to newdesk@shifa.example will stop working.',
        );
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Revoke invite' })
            .click();
        await expect(page.getByText('Invitation revoked.')).toBeVisible();

        await page
            .getByRole('button', { name: 'Deactivate Bilal Ahmed' })
            .click();
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Deactivate' })
            .click();
        await expect(page.getByText('User deactivated.')).toBeVisible();
        await page
            .getByRole('button', { name: 'Reactivate Bilal Ahmed' })
            .click();
        await expect(page.getByText('User reactivated.')).toBeVisible();
    });
});

test.describe('Services', () => {
    test('turns a service off, adds one, and edits another', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/services'), 'en');

        await page.getByRole('switch', { name: 'Child check-up' }).click();
        await expect(
            page.getByText('Child check-up turned off.'),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Add service' }).click();
        const dialog = page.getByRole('dialog');

        await dialog.getByRole('button', { name: 'Save service' }).click();
        await expect(dialog).toContainText('Enter a name for this service.');
        await dialog.getByLabel('Service name').fill('Vaccination');
        await dialog
            .getByRole('button', { name: 'Increase by 5 minutes (Duration)' })
            .click();
        await dialog.getByRole('checkbox', { name: 'Dr. Sana Malik' }).check();
        await dialog.getByRole('button', { name: 'Save service' }).click();
        await expect(page.getByText('Service saved.')).toBeVisible();
        await expect(
            page.getByRole('table').getByText('Vaccination'),
        ).toBeVisible();

        await page
            .getByRole('button', { name: 'Edit Follow-up visit' })
            .click();
        await expect(page.getByRole('dialog')).toContainText('Edit service');
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('dialog')).toBeHidden();
    });
});

test.describe('Clinic settings', () => {
    test('edits, saves and asks before changing the timezone', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin/settings'), 'en');

        await expect(
            page.getByRole('button', { name: 'Save settings' }),
        ).toBeDisabled();
        await page.getByLabel('Clinic name').fill('Shifa Clinic');
        await expect(page.getByText('Unsaved changes')).toBeVisible();

        await page
            .getByRole('switch', {
                name: 'Doctors approve reschedule requests from patients',
            })
            .click();
        await page.getByLabel('Timezone').selectOption('Asia/Dubai');
        await page.getByRole('button', { name: 'Save settings' }).click();

        const dialog = page.getByRole('alertdialog');

        await expect(dialog).toContainText('Change the timezone?');
        await dialog
            .getByRole('button', { name: 'Change timezone and save' })
            .click();
        await expect(page.getByText('Settings saved').first()).toBeVisible();
        await expect(page.getByText('Unsaved changes')).toBeHidden();
    });

    test('hours, holidays and reminders follow the rules', async ({ page }) => {
        await gotoIn(page, url('/admin/settings'), 'en');

        const monday = page.getByRole('group', { name: 'Monday' });

        await monday
            .getByRole('button', { name: 'Later by 30 minutes (Opens)' })
            .click();
        await expect(monday.getByText('09:30')).toBeVisible();
        await page.getByRole('switch', { name: 'Sunday' }).click();
        await expect(
            page.getByRole('group', { name: 'Sunday' }).getByText('Closed'),
        ).toBeHidden();

        await page.getByRole('button', { name: 'Add holiday' }).click();
        await expect(
            page.getByText('Choose a date and give the holiday a name.'),
        ).toBeVisible();
        await page.getByLabel('Date').fill('2026-12-25');
        await page.getByLabel('Name', { exact: true }).fill('Christmas');
        await page.getByRole('button', { name: 'Add holiday' }).click();
        await expect(page.getByText('Christmas')).toBeVisible();

        await page.getByLabel('Add a reminder').selectOption('48');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(
            page.getByRole('button', {
                name: 'Remove reminder: 48 hours before',
            }),
        ).toBeVisible();
        await expect(
            page.getByLabel('Add a reminder').locator('option', {
                hasText: '48 hours before',
            }),
        ).toHaveCount(0);

        await page.getByRole('switch', { name: 'Voice is on' }).click();
        await expect(page.getByLabel('Keep voice audio for')).toBeDisabled();
    });

    test('asks before leaving with unsaved changes', async ({ page }) => {
        await gotoIn(page, url('/admin/settings'), 'en');
        await page.getByLabel('Address').fill('Somewhere else');

        const dialogs: string[] = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.dismiss();
        });

        await page
            .getByRole('navigation', { name: 'Main menu' })
            .getByRole('link', { name: 'Staff' })
            .click();

        await expect.poll(() => dialogs.length).toBeGreaterThan(0);
        await expect(page).toHaveURL(/\/admin\/settings/);
    });
});
