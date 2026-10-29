import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
    gotoIn,
    setLocaleCookie,
    sidewaysOverflow,
    smallTargets,
    watchConsole,
} from './helpers';

// Account (F1), shared by every staff role. Reduced motion keeps screenshots and measurements
// deterministic, and the clock is pinned to Monday 10:15 in Karachi like the other modules.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/account';
mkdirSync(SHOTS, { recursive: true });

const ROLES = [
    { role: 'clinic_admin', name: 'Ayesha Khan', label: 'Clinic Admin' },
    { role: 'receptionist', name: 'Bilal Ahmed', label: 'Receptionist' },
    { role: 'doctor', name: 'Dr. Sana Malik', label: 'Doctor' },
] as const;

test.describe('every role, in both languages', () => {
    for (const locale of ['en', 'ur'] as const) {
        for (const { role, name } of ROLES) {
            test(`account (${role}, ${locale}): loads clean, mirrors, fits, has 44px targets`, async ({
                page,
                baseURL,
            }) => {
                const problems = watchConsole(page);
                await setLocaleCookie(page, baseURL!, locale);

                for (const width of [1440, 820, 390]) {
                    await page.setViewportSize({ width, height: 900 });
                    await page.goto(url(`/account?role=${role}`), {
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
                    ).toHaveText(locale === 'ur' ? 'اکاؤنٹ' : 'Account');
                    await expect(
                        page.getByLabel(
                            locale === 'ur' ? 'پورا نام' : 'Full name',
                        ),
                    ).toHaveValue(name);
                    await page.waitForLoadState('networkidle');
                    await page.evaluate(() => document.fonts.ready);
                    await page.screenshot({
                        path: `${SHOTS}/account-${role}-${locale}-${width}.png`,
                        fullPage: true,
                    });

                    expect(
                        await sidewaysOverflow(page),
                        `${role} ${locale} ${width}px sideways overflow`,
                    ).toBeLessThanOrEqual(0);
                    expect(
                        await smallTargets(page),
                        `${role} ${locale} ${width}px small targets`,
                    ).toEqual([]);
                }

                expect(problems).toEqual([]);
            });
        }
    }
});

test.describe('the shell', () => {
    test('opens in the area the person was in, with no sidebar item highlighted', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor'), 'en');
        await expect(page.getByText('Next patient')).toBeVisible();

        await page.getByRole('button', { name: /User menu/ }).click();
        await page.getByRole('menuitem', { name: 'Account' }).click();

        await expect(page).toHaveURL(/\/account/);
        await expect(page.getByLabel('Full name')).toHaveValue(
            'Dr. Sana Malik',
        );
        const nav = page.getByRole('navigation', { name: 'Main menu' });
        // The doctor's own four items, none of them current.
        await expect(nav.locator('li a')).toHaveCount(4);
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    });

    test('the receptionist’s account has no dead "New booking" button', async ({
        page,
    }) => {
        await gotoIn(page, url('/account?role=receptionist'), 'en');

        await expect(page.getByLabel('Full name')).toHaveValue('Bilal Ahmed');
        await expect(
            page.getByRole('button', { name: /New booking/ }),
        ).toHaveCount(0);
    });

    test('shows the real name and role in the top bar of every staff area', async ({
        page,
    }) => {
        for (const [path, who, role] of [
            ['/admin', 'Ayesha Khan', 'Clinic Admin'],
            ['/reception', 'Bilal Ahmed', 'Receptionist'],
            ['/doctor', 'Dr. Sana Malik', 'Doctor'],
        ]) {
            await gotoIn(page, url(path), 'en');
            const menu = page.getByRole('button', { name: /User menu/ });

            await expect(menu).toContainText(who);
            await expect(menu).toContainText(role);
        }
    });
});

test.describe('Profile', () => {
    test('saving a new name changes the top bar at once', async ({ page }) => {
        await gotoIn(page, url('/account?role=clinic_admin'), 'en');

        const name = page.getByLabel('Full name');
        await name.fill('Ayesha K. Khan');
        await expect(page.getByText('Unsaved changes')).toBeVisible();
        await page.getByRole('button', { name: 'Save profile' }).click();

        await expect(page.getByText('Profile saved').first()).toBeVisible();
        await expect(
            page.getByRole('button', { name: /User menu/ }),
        ).toContainText('Ayesha K. Khan');
    });

    test('choosing a language switches the page at once', async ({ page }) => {
        await gotoIn(page, url('/account'), 'en');

        await page.getByRole('radio', { name: 'اردو' }).check();

        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            'اکاؤنٹ',
        );
    });

    test('asks before leaving with an unsaved name', async ({ page }) => {
        await gotoIn(page, url('/account'), 'en');
        await page.getByLabel('Full name').fill('Someone Else');

        let asked = false;
        page.once('dialog', (dialog) => {
            asked = true;
            void dialog.dismiss();
        });
        await page
            .getByRole('navigation', { name: 'Main menu' })
            .getByRole('link', { name: 'Overview' })
            .click();

        await expect.poll(() => asked).toBe(true);
        await expect(page).toHaveURL(/\/account/);
    });

    test('the email is read only', async ({ page }) => {
        await gotoIn(page, url('/account'), 'en');

        await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
    });
});

test.describe('Change password', () => {
    test('a wrong current password is said at the field and keeps focus there', async ({
        page,
    }) => {
        await gotoIn(page, url('/account'), 'en');

        await page.getByLabel('Current password').fill('not-it');
        await page
            .getByLabel('New password', { exact: true })
            .fill('Better-pass-2026');
        await page.getByLabel('Confirm new password').fill('Better-pass-2026');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(
            page.getByText('That is not your current password.'),
        ).toBeVisible();
        await expect(page.getByLabel('Current password')).toBeFocused();
    });

    test('changes the password with the sample one', async ({ page }) => {
        await gotoIn(page, url('/account'), 'en');

        await page.getByLabel('Current password').fill('Sample-password-1');
        await page
            .getByLabel('New password', { exact: true })
            .fill('Better-pass-2026');
        await page.getByLabel('Confirm new password').fill('Better-pass-2026');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(
            page
                .getByText('Password changed. Other sessions were signed out.')
                .first(),
        ).toBeVisible();
        await expect(page.getByLabel('Current password')).toHaveValue('');
    });

    test('says what is wrong with a weak password before asking the server', async ({
        page,
    }) => {
        await gotoIn(page, url('/account'), 'en');

        await page.getByLabel('Current password').fill('Sample-password-1');
        await page.getByLabel('New password', { exact: true }).fill('short1');
        await page.getByLabel('Confirm new password').fill('short1');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(
            page.getByText(
                'Use at least 10 characters, with letters and numbers.',
            ),
        ).toBeVisible();
    });
});

test.describe('Notification preferences and sessions', () => {
    test('a switch saves at once, and works with the keyboard', async ({
        page,
    }) => {
        await gotoIn(page, url('/account'), 'en');
        const summary = page.getByRole('switch', { name: 'Daily summary' });

        await summary.focus();
        await page.keyboard.press('Space');

        await expect(summary).toBeChecked();
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    });

    test('signs out other sessions after asking for the password', async ({
        page,
    }) => {
        await gotoIn(page, url('/account'), 'en');

        await page
            .getByRole('button', { name: 'Sign out other sessions' })
            .click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Your password').fill('nope');
        await dialog
            .getByRole('button', { name: 'Sign out other sessions' })
            .click();
        await expect(
            dialog.getByText('That is not your password.'),
        ).toBeVisible();

        await dialog.getByLabel('Your password').fill('Sample-password-1');
        await dialog
            .getByRole('button', { name: 'Sign out other sessions' })
            .click();

        await expect(
            page.getByText('2 other sessions were signed out.'),
        ).toBeVisible();
        await expect(dialog).toBeHidden();
    });
});

test.describe('states', () => {
    test('shows loading and error on request', async ({ page }) => {
        await gotoIn(page, url('/account?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading your account' }),
        ).toBeVisible();

        await gotoIn(page, url('/account?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );

        await gotoIn(page, url('/account?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
    });
});
