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

// Public and sign-in pages. Reduced motion makes scroll-reveal content visible at
// once, so screenshots and measurements are deterministic.
test.use({ reducedMotion: 'reduce' });

const SHOTS = 'storage/app/screenshots/public-and-sign-in';
mkdirSync(SHOTS, { recursive: true });

const PAGES: { name: string; path: string; h1: Record<Locale, string> }[] = [
    {
        name: 'landing',
        path: '/',
        h1: {
            en: 'Appointments booked while the patient is still on the line.',
            ur: 'مریض ابھی فون پر ہو، اور اپائنٹمنٹ بُک ہو چکی ہو۔',
        },
    },
    {
        name: 'register',
        path: '/register',
        h1: { en: 'Start your clinic', ur: 'اپنا کلینک شروع کریں' },
    },
    {
        name: 'login',
        path: '/login',
        h1: { en: 'Welcome back', ur: 'خوش آمدید' },
    },
    {
        name: 'forgot',
        path: '/forgot-password',
        h1: { en: 'Reset your password', ur: 'اپنا پاس ورڈ ری سیٹ کریں' },
    },
    {
        name: 'reset',
        path: '/reset-password/sample-valid',
        h1: { en: 'Choose a new password', ur: 'نیا پاس ورڈ چنیں' },
    },
    {
        name: 'invite',
        path: '/invite/sample-receptionist',
        h1: {
            en: 'You have been invited to join a clinic',
            ur: 'آپ کو کلینک میں شامل ہونے کی دعوت دی گئی ہے',
        },
    },
    {
        name: 'privacy',
        path: '/privacy',
        h1: { en: 'Privacy and terms', ur: 'رازداری اور شرائط' },
    },
];

test.describe('every page, in both languages', () => {
    for (const locale of ['en', 'ur'] as const) {
        for (const page of PAGES) {
            test(`${page.name} (${locale}): loads clean, mirrors, fits, has 44px targets`, async ({
                page: p,
                baseURL,
            }) => {
                const problems = watchConsole(p);
                await setLocaleCookie(p, baseURL!, locale);

                for (const width of [1440, 390]) {
                    await p.setViewportSize({ width, height: 900 });
                    await p.goto(page.path, { waitUntil: 'domcontentloaded' });

                    await expect(p.locator('html')).toHaveAttribute(
                        'lang',
                        locale,
                    );
                    await expect(p.locator('html')).toHaveAttribute(
                        'dir',
                        locale === 'ur' ? 'rtl' : 'ltr',
                    );
                    await expect(
                        p.getByRole('heading', { level: 1 }),
                    ).toHaveText(page.h1[locale]);
                    await expect(
                        p.getByRole('heading', { level: 1 }),
                    ).toBeVisible();
                    await p.evaluate(() => document.fonts.ready);

                    await p.screenshot({
                        path: `${SHOTS}/${page.name}-${locale}-${width}.png`,
                        fullPage: true,
                    });

                    expect(
                        await sidewaysOverflow(p),
                        `${page.name} ${locale} ${width}px sideways overflow`,
                    ).toBeLessThanOrEqual(0);
                    expect(
                        await smallTargets(p),
                        `${page.name} ${locale} ${width}px small targets`,
                    ).toEqual([]);
                }

                expect(problems).toEqual([]);
            });
        }
    }
});

test.describe('A3 login', () => {
    test('signs a receptionist in and lands on the placeholder for their role', async ({
        page,
    }) => {
        await gotoIn(page, '/login', 'en');
        await page.getByLabel('Email').fill('reception@sample.vocamed.test');
        await page
            .getByLabel('Password', { exact: true })
            .fill('Sample-password-1');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page).toHaveURL(/\/reception$/);
        await expect(
            page.getByRole('heading', { name: 'Signed in as Receptionist' }),
        ).toBeVisible();
    });

    test('can be done with the keyboard alone', async ({ page }) => {
        await gotoIn(page, '/login', 'en');
        await page.getByLabel('Email').focus();
        await page.keyboard.type('doctor@sample.vocamed.test');
        await page.keyboard.press('Tab');
        await page.keyboard.type('Sample-password-1');
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/\/doctor$/);
    });

    test('shows the mismatch alert, clears the password and refocuses it', async ({
        page,
    }) => {
        await gotoIn(page, '/login', 'en');
        await page.getByLabel('Email').fill('admin@sample.vocamed.test');
        await page
            .getByLabel('Password', { exact: true })
            .fill('wrong-password');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.getByRole('alert')).toContainText(
            'That email and password do not match.',
        );
        await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
            '',
        );
        await expect(
            page.getByLabel('Password', { exact: true }),
        ).toBeFocused();
    });

    test('locks after five wrong attempts and shows a countdown', async ({
        page,
    }) => {
        await gotoIn(page, '/login', 'en');
        await page.getByLabel('Email').fill('doctor@sample.vocamed.test');

        for (let i = 0; i < 5; i++) {
            await page
                .getByLabel('Password', { exact: true })
                .fill('wrong-password');
            await page.getByRole('button', { name: 'Sign in' }).click();
            await expect(
                page.getByLabel('Password', { exact: true }),
            ).toHaveValue('');
        }

        await expect(
            page.getByText(/Too many attempts. Try again in \d:\d\d\./),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Sign in' }),
        ).toBeDisabled();
    });

    test('links to forgot password, sign-up and privacy', async ({ page }) => {
        await gotoIn(page, '/login', 'en');

        await expect(
            page.getByRole('link', { name: 'Forgot password?' }),
        ).toHaveAttribute('href', '/forgot-password');
        await expect(
            page.getByRole('link', { name: 'Start your clinic' }),
        ).toHaveAttribute('href', '/register');
        await page.getByRole('link', { name: 'Privacy and terms' }).click();
        await expect(page).toHaveURL(/\/privacy$/);
    });
});

test.describe('A4 to A6 recovery and invitation', () => {
    test('forgot password gives the same answer for any address', async ({
        page,
    }) => {
        await gotoIn(page, '/forgot-password', 'en');
        await page.getByLabel('Email').fill('nobody@example.com');
        await page.getByRole('button', { name: 'Send reset link' }).click();

        await expect(
            page.getByRole('heading', { name: 'Check your email' }),
        ).toBeFocused();
        await expect(
            page.getByText(/If an account exists for that email/),
        ).toBeVisible();
    });

    test('reset password: meter, mismatch, save', async ({ page }) => {
        await gotoIn(page, '/reset-password/sample-valid', 'en');

        await expect(
            page.getByRole('button', { name: 'Save new password' }),
        ).toBeDisabled();
        await page
            .getByLabel('New password', { exact: true })
            .fill('abcdefghi1');
        await expect(page.getByText('Fair')).toBeVisible();
        await page.getByLabel('Confirm new password').fill('different11');
        await expect(
            page.getByText('The two passwords do not match.'),
        ).toBeVisible();

        await page.getByLabel('Confirm new password').fill('abcdefghi1');
        await page.getByRole('button', { name: 'Save new password' }).click();
        await expect(
            page.getByRole('heading', { name: 'Password updated' }),
        ).toBeVisible();
    });

    test('reset password: an expired or unknown link says expired', async ({
        page,
    }) => {
        await gotoIn(page, '/reset-password/sample-expired', 'en');
        await expect(
            page.getByRole('heading', { name: 'This link has expired' }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Request a new link' }),
        ).toHaveAttribute('href', '/forgot-password');
    });

    test('invitation: shows the role, validates, accepts', async ({ page }) => {
        await gotoIn(page, '/invite/sample-doctor', 'en');

        await expect(page.getByText('[Clinic name]')).toBeVisible();
        await expect(page.getByText('Doctor', { exact: true })).toBeVisible();

        await page
            .getByRole('button', { name: 'Accept invitation and continue' })
            .click();
        await expect(page.getByLabel('Your full name')).toBeFocused();

        await page.getByLabel('Your full name').fill('Sample Person');
        await page
            .getByLabel('Choose a password', { exact: true })
            .fill('abcdefghi1');
        await page
            .getByRole('button', { name: 'Accept invitation and continue' })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Welcome aboard' }),
        ).toBeVisible();
    });

    test('invitation: expired and used', async ({ page }) => {
        await gotoIn(page, '/invite/sample-expired', 'en');
        await expect(
            page.getByRole('heading', { name: 'This invitation has expired' }),
        ).toBeVisible();

        await gotoIn(page, '/invite/sample-used', 'en');
        await expect(
            page.getByRole('heading', {
                name: 'This invitation was already used',
            }),
        ).toBeVisible();
    });
});

test.describe('A2 sign-up', () => {
    test('picking a country pre-selects its timezone, then sign-up shows Check your email', async ({
        page,
    }) => {
        await gotoIn(page, '/register', 'en');

        await page.getByRole('combobox', { name: 'Country' }).click();
        await page
            .getByRole('option', { name: 'United Arab Emirates' })
            .click();
        await expect(
            page.getByRole('combobox', { name: 'Timezone' }),
        ).toContainText('Asia/Dubai (UTC+4)');

        await page.getByLabel('Clinic name').fill('A clinic');
        await page.getByLabel('Your full name').fill('A person');
        await page.getByLabel('Work email').fill('new@yourclinic.com');
        await page.getByLabel('Password', { exact: true }).fill('abcdefghi1');
        await page.getByRole('checkbox').check();
        await page
            .getByRole('button', { name: 'Create clinic workspace' })
            .click();

        await expect(
            page.getByRole('heading', { name: 'Check your email' }),
        ).toBeVisible();
    });

    test('lists every problem and focuses the first', async ({ page }) => {
        await gotoIn(page, '/register', 'en');
        await page
            .getByRole('button', { name: 'Create clinic workspace' })
            .click();

        await expect(page.getByLabel('Clinic name')).toBeFocused();
        await expect(page.getByRole('alert')).toHaveCount(5);
    });
});

test.describe('A7 privacy and terms', () => {
    test('switches to the terms, keeps it in the URL, and every placeholder stays bracketed', async ({
        page,
    }) => {
        await gotoIn(page, '/privacy', 'en');
        await expect(page.locator('article h2')).toHaveCount(6);

        await page.getByRole('button', { name: 'Terms of service' }).click();
        await expect(page).toHaveURL(/\?doc=terms/);
        await expect(
            page.getByRole('heading', { name: 'Using VocaMed', level: 2 }),
        ).toBeVisible();

        for (const mark of await page
            .locator('article mark')
            .allTextContents()) {
            expect(mark.startsWith('[') && mark.endsWith(']')).toBe(true);
        }

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(
            page.getByRole('button', { name: 'Terms of service' }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('the section list jumps to its section', async ({ page }) => {
        await gotoIn(page, '/privacy', 'en');
        await page
            .getByRole('link', { name: 'Data requests and contact' })
            .click();
        await expect(page).toHaveURL(/#requests$/);
        await expect(page.locator('#requests')).toBeInViewport();
    });
});

test.describe('A1 landing', () => {
    test('header links scroll to their sections, and the header turns solid once scrolled', async ({
        page,
    }) => {
        await gotoIn(page, '/', 'en');

        await page
            .getByRole('navigation', { name: 'Main' })
            .getByRole('link', { name: 'FAQ' })
            .click();
        await expect(page.locator('#faq')).toBeInViewport();
        await expect(page.locator('header').first()).toHaveClass(/shadow-menu/);
    });

    test('FAQ opens one answer at a time', async ({ page }) => {
        await gotoIn(page, '/', 'en');

        const second = page.getByRole('button', {
            name: 'Can voice book something by mistake?',
        });
        await second.click();
        await expect(second).toHaveAttribute('aria-expanded', 'true');
        await expect(
            page.getByRole('button', { name: 'Do I have to use voice?' }),
        ).toHaveAttribute('aria-expanded', 'false');
        await expect(
            page.getByText(/Voice only fills a review card/),
        ).toBeVisible();
    });

    test('Request a demo opens a dialog that says nothing is sent; Escape closes it', async ({
        page,
    }) => {
        await gotoIn(page, '/', 'en');

        await page
            .getByRole('button', { name: 'Request a demo' })
            .first()
            .click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText(
            'requests are not sent anywhere yet',
        );
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('Watch the demo shows a bracketed stand-in, not a video', async ({
        page,
    }) => {
        await gotoIn(page, '/', 'en');

        await page
            .getByRole('button', { name: 'Watch the 15-second demo' })
            .click();
        await expect(page.getByRole('dialog')).toContainText(
            '[15-second demo clip to be supplied]',
        );
        await expect(page.locator('video')).toHaveCount(0);
    });

    test('the language switch flips the page and survives a reload', async ({
        page,
    }) => {
        await gotoIn(page, '/', 'en');

        await page.getByRole('button', { name: 'اردو' }).first().click();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            'مریض ابھی فون پر ہو، اور اپائنٹمنٹ بُک ہو چکی ہو۔',
        );

        // The choice is saved in a cookie by a background request; wait for it, then reload.
        await expect
            .poll(
                async () =>
                    (await page.context().cookies()).find(
                        (cookie) => cookie.name === 'locale',
                    )?.value,
            )
            .toBe('ur');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });

    test('no testimonials, statistics or logos, and the sample data is labelled', async ({
        page,
    }) => {
        await gotoIn(page, '/', 'en');

        const text = await page.locator('main').innerText();
        expect(text).not.toMatch(/testimonial|trusted by|customers|\d+\s?%/i);
        await expect(page.getByText('Sample data')).toHaveCount(2);
        await expect(page.locator('main img')).toHaveCount(0);
    });
});
