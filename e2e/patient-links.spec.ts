import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
    gotoIn,
    setLocaleCookie,
    sidewaysOverflow,
    smallTargets,
    watchConsole,
    type Locale,
} from './helpers';

// Patient link pages: Manage appointment, Reschedule, Queue status and Link expired. They are used
// on a phone, so every page is checked at 390px first. The clock is pinned to Monday 10:15 in Karachi.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/patient-links';
mkdirSync(SHOTS, { recursive: true });

const PAGES: {
    name: string;
    path: string;
    h1: Record<Locale, string>;
}[] = [
    {
        name: 'manage',
        path: '/p/sample-booked',
        h1: { en: 'Hello Bilqees', ur: 'السلام علیکم Bilqees' },
    },
    {
        name: 'reschedule',
        path: '/p/sample-booked/reschedule',
        h1: { en: 'Choose a new time', ur: 'نیا وقت چنیں' },
    },
    {
        name: 'status',
        path: '/p/sample-waiting/status',
        h1: { en: 'Your place in the queue', ur: 'قطار میں آپ کی باری' },
    },
    {
        name: 'expired',
        path: '/p/sample-expired',
        h1: { en: 'This link has expired', ur: 'یہ لنک ختم ہو چکا ہے' },
    },
];

/** The big buttons are 56px, as designed. */
async function mainButtonHeights(page: Page) {
    return page.evaluate(() =>
        [
            ...document.querySelectorAll<HTMLElement>(
                '[data-slot=patient-button]',
            ),
        ]
            .filter((el) => el.getBoundingClientRect().height > 0)
            .map((el) => Math.round(el.getBoundingClientRect().height)),
    );
}

test.describe('every page, in both languages', () => {
    for (const locale of ['en', 'ur'] as const) {
        for (const spec of PAGES) {
            test(`${spec.name} (${locale}): loads clean, mirrors, fits, has 44px targets`, async ({
                page,
                baseURL,
            }) => {
                const problems = watchConsole(page);
                await setLocaleCookie(page, baseURL!, locale);

                for (const width of [390, 820, 1440]) {
                    await page.setViewportSize({ width, height: 844 });
                    await page.goto(url(spec.path), {
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
                    await page.waitForLoadState('networkidle');
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

                    for (const height of await mainButtonHeights(page)) {
                        expect(height).toBeGreaterThanOrEqual(56);
                    }
                }

                expect(problems).toEqual([]);
            });
        }
    }
});

test.describe('the column', () => {
    test('is centred and 480px wide on a desktop, not stretched', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoIn(page, url('/p/sample-booked'), 'en');
        const main = page.getByRole('main');
        await expect(main).toBeVisible();
        const box = (await main.boundingBox())!;

        expect(Math.round(box.width)).toBe(480);
        expect(Math.round(box.x + box.width / 2)).toBe(720);
    });

    test('shows the clinic’s name in the header and the language switch', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await expect(
            page.getByRole('banner').getByText('Shifa Family Clinic'),
        ).toBeVisible();
        await expect(
            page.getByRole('group', { name: 'Language' }),
        ).toBeVisible();
    });
});

test.describe('Manage appointment', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
    });

    test('confirms, and the page says so', async ({ page }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await page.getByRole('button', { name: 'Confirm appointment' }).click();

        await expect(
            page.getByText('Thank you, you are confirmed'),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /Confirmed/ }),
        ).toBeDisabled();
    });

    test('asks before cancelling, starts on the safe choice, then cancels', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await page.getByRole('button', { name: 'Cancel appointment' }).click();
        const sheet = page.getByRole('alertdialog');
        await expect(sheet).toBeVisible();
        await expect(
            sheet.getByRole('button', { name: 'No, keep it' }),
        ).toBeFocused();

        // On a phone it is a sheet that sits at the bottom of the screen.
        const box = (await sheet.boundingBox())!;
        expect(Math.round(box.y + box.height)).toBe(844);

        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
        await expect(
            page.getByRole('button', { name: 'Cancel appointment' }),
        ).toBeFocused();

        await page.getByRole('button', { name: 'Cancel appointment' }).click();
        await page.getByRole('button', { name: 'Yes, cancel' }).click();
        await expect(
            page.getByText('Your appointment is cancelled'),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Cancel appointment' }),
        ).toHaveCount(0);
    });

    test('the cancel confirmation is a centred dialog on a wide screen', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await page.getByRole('button', { name: 'Cancel appointment' }).click();
        const box = (await page.getByRole('alertdialog').boundingBox())!;

        expect(Math.round(box.x + box.width / 2)).toBe(640);
        expect(box.y).toBeGreaterThan(100);
    });

    test('moves on to Reschedule and back', async ({ page }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await page.getByRole('link', { name: 'Reschedule' }).click();
        await expect(page).toHaveURL(/\/p\/sample-booked\/reschedule/);
        await expect(
            page.getByRole('heading', { level: 1, name: 'Choose a new time' }),
        ).toBeVisible();
        await page.getByRole('link', { name: 'Back', exact: true }).click();
        await expect(page).toHaveURL(/\/p\/sample-booked$/);
    });

    test('the language switch changes the page in place', async ({ page }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await page.getByRole('button', { name: 'اردو' }).click();

        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.getByRole('heading', { level: 1 })).toContainText(
            'السلام علیکم',
        );
    });

    test('says when it is too late to change, with a call link', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-late'), 'en');

        await expect(
            page.getByText('It is too late to change this online'),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: /Call the clinic/ }),
        ).toHaveAttribute('href', 'tel:+922135001122');
        await expect(
            page.getByRole('button', { name: 'Cancel appointment' }),
        ).toHaveCount(0);
    });

    test('says a request is waiting', async ({ page }) => {
        await gotoIn(page, url('/p/sample-pending'), 'en');

        await expect(
            page.getByText('Your request is with the clinic'),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Reschedule' }),
        ).toHaveCount(0);
    });

    test('shows loading and error on request', async ({ page }) => {
        await gotoIn(page, url('/p/sample-booked?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading your appointment' }),
        ).toBeVisible();

        await gotoIn(page, url('/p/sample-booked?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );
    });

    test('keeps the link out of the page head and asks not to be indexed', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-booked'), 'en');

        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
            'content',
            /noindex/,
        );
        await expect(page).toHaveTitle(/Your appointment/);
        expect(await page.title()).not.toContain('Bilqees');
    });
});

test.describe('Reschedule', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
    });

    test('picks a day and a time and moves the appointment', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-booked/reschedule'), 'en');
        const days = page.getByRole('group', { name: 'Day' });

        await expect(days.getByRole('button')).toHaveCount(14);
        await expect(
            days.getByRole('button', { name: /Sunday 1 November, Closed/ }),
        ).toBeDisabled();

        const submit = page.getByRole('button', { name: 'Choose a time' });
        await expect(submit).toBeDisabled();
        await days
            .getByRole('button', { name: 'Wednesday 28 October' })
            .click();
        await page
            .getByRole('group', { name: 'Time' })
            .getByRole('button')
            .first()
            .click();
        await page.getByRole('button', { name: 'Confirm new time' }).click();

        await expect(page.getByText('Your appointment is moved')).toBeVisible();
        await page
            .getByRole('link', { name: 'Back to my appointment' })
            .click();
        await expect(page.getByText(/Wed 28 October/)).toBeVisible();
    });

    test('a clinic that approves changes gets a request, and the original stays', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-approval/reschedule'), 'en');

        await expect(
            page.getByText(/This clinic approves time changes/),
        ).toBeVisible();
        await page
            .getByRole('group', { name: 'Time' })
            .getByRole('button')
            .first()
            .click();
        await page.getByRole('button', { name: 'Send request' }).click();

        await expect(page.getByText('Request sent')).toBeVisible();
        await page
            .getByRole('link', { name: 'Back to my appointment' })
            .click();
        await expect(
            page.getByText('Your request is with the clinic'),
        ).toBeVisible();
    });

    test('keyboard: the day buttons and times can be chosen with Enter and Space', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-booked/reschedule'), 'en');

        await page
            .getByRole('group', { name: 'Day' })
            .getByRole('button', { name: 'Thursday 29 October' })
            .focus();
        await page.keyboard.press('Enter');
        await expect(
            page
                .getByRole('group', { name: 'Day' })
                .getByRole('button', { name: 'Thursday 29 October' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await page
            .getByRole('group', { name: 'Time' })
            .getByRole('button')
            .nth(1)
            .focus();
        await page.keyboard.press('Space');
        await expect(
            page.getByRole('button', { name: 'Confirm new time' }),
        ).toBeEnabled();
    });
});

test.describe('Queue status', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
    });

    test('shows each stage', async ({ page }) => {
        const stages: [string, string][] = [
            ['sample-waiting', 'Please wait'],
            ['sample-next', 'You are next'],
            ['sample-consult', 'Your consultation is in progress'],
            ['sample-done', 'Your visit is complete'],
            ['sample-notarrived', 'You have not checked in yet'],
            ['sample-booked', 'The queue opens on the day of your appointment'],
        ];

        for (const [token, headline] of stages) {
            await gotoIn(page, url(`/p/${token}/status`), 'en');
            await expect(
                page.getByText(headline, { exact: true }),
            ).toBeVisible();
        }
    });

    test('shows the counts, the estimate and a live "updated" line', async ({
        page,
    }) => {
        await gotoIn(page, url('/p/sample-waiting/status'), 'en');

        await expect(page.getByText('Patients ahead of you')).toBeVisible();
        await expect(page.getByText('20 min')).toBeVisible();
        await expect(page.getByText(/Updated/)).toBeVisible();
        await expect(
            page.getByText('Please wait').locator('xpath=ancestor::section'),
        ).toHaveAttribute('aria-live', 'polite');
    });

    test('says updates are paused when reconnecting', async ({ page }) => {
        await gotoIn(
            page,
            url('/p/sample-waiting/status?state=reconnecting'),
            'en',
        );

        await expect(
            page.getByText('Updates paused. Reconnecting…'),
        ).toBeVisible();
        await expect(page.getByText('Please wait')).toBeVisible();
    });
});

test.describe('Link expired', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
    });

    test('requests a new link and says so', async ({ page }) => {
        await gotoIn(page, url('/p/sample-expired'), 'en');

        await page.getByRole('button', { name: 'Send me a new link' }).click();

        await expect(
            page.getByText(/Request sent\. If the number matches a booking/),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: /New link requested/ }),
        ).toBeDisabled();
    });

    test('an unknown link shows no clinic and no phone', async ({ page }) => {
        await gotoIn(page, url('/p/sample-unknown'), 'en');

        await expect(
            page.getByRole('heading', {
                level: 1,
                name: 'We could not open this link',
            }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: /Call the clinic/ }),
        ).toHaveCount(0);
        await expect(page.getByRole('banner')).not.toContainText('Shifa');
    });

    test('the expired route shows the same page', async ({ page }) => {
        await gotoIn(page, url('/p/sample-expired/expired'), 'en');

        await expect(
            page.getByRole('heading', {
                level: 1,
                name: 'This link has expired',
            }),
        ).toBeVisible();
    });

    test('an old link shows the same page from the other patient pages', async ({
        page,
    }) => {
        for (const path of [
            '/p/sample-expired',
            '/p/sample-expired/reschedule',
            '/p/sample-expired/status',
        ]) {
            await gotoIn(page, url(path), 'en');
            await expect(
                page.getByRole('heading', {
                    level: 1,
                    name: 'This link has expired',
                }),
            ).toBeVisible();
        }
    });
});
