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

// Doctor workspace: Overview, My schedule, Availability and Requests. Reduced motion keeps
// screenshots and measurements deterministic. The in-browser mock is seeded relative to "now", so
// every test starts on Monday 10:15 in Karachi.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/doctor-workspace';
mkdirSync(SHOTS, { recursive: true });

const PAGES: {
    name: string;
    path: string;
    h1: Record<Locale, string>;
    ready: string;
}[] = [
    {
        name: 'overview',
        path: url('/doctor'),
        h1: { en: 'Today', ur: 'آج' },
        ready: 'Next patient',
    },
    {
        name: 'schedule',
        path: url('/doctor/schedule'),
        h1: { en: 'My schedule', ur: 'میرا شیڈول' },
        ready: 'Day schedule',
    },
    {
        name: 'availability',
        path: url('/doctor/availability'),
        h1: { en: 'Availability', ur: 'دستیابی' },
        ready: 'Monday',
    },
    {
        name: 'requests',
        path: url('/doctor/requests'),
        h1: {
            en: 'Reschedule requests',
            ur: 'وقت بدلنے کی درخواستیں',
        },
        ready: 'Waiting for you',
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
                            spec.name === 'schedule'
                                ? page.getByRole('table', { name: spec.ready })
                                : spec.name === 'availability'
                                  ? page.getByRole('switch', {
                                        name: spec.ready,
                                    })
                                  : page.getByRole('heading', {
                                        name: new RegExp(spec.ready),
                                    }),
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
    test('shows the doctor’s four items, the active page and the requests badge', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor/schedule'), 'en');
        const nav = page.getByRole('navigation', { name: 'Main menu' });

        await expect(nav.getByRole('link')).toHaveCount(5);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(
            'My schedule',
        );
        await expect(nav.getByRole('link', { name: /Requests/ })).toContainText(
            '2',
        );
        await expect(
            page.getByRole('button', { name: /New booking/ }),
        ).toHaveCount(0);
    });

    test('the sidebar moves between the four pages without a full reload', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor'), 'en');
        await expect(page.getByText('Next patient')).toBeVisible();

        const nav = page.getByRole('navigation', { name: 'Main menu' });
        await nav.getByRole('link', { name: 'Availability' }).click();
        await expect(page).toHaveURL(/\/doctor\/availability/);
        await expect(
            page.getByRole('heading', { level: 1, name: 'Availability' }),
        ).toBeVisible();
        await nav.getByRole('link', { name: /Requests/ }).click();
        await expect(page).toHaveURL(/\/doctor\/requests/);
    });

    test('shows loading, error and reconnecting on request', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading today’s schedule' }),
        ).toBeVisible();

        await gotoIn(page, url('/doctor?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );

        await gotoIn(page, url('/doctor?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
        await expect(page.getByText('Next patient')).toBeVisible();
    });
});

test.describe('Overview', () => {
    test('finishes a consultation and starts the next patient', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor'), 'en');
        const card = page.getByRole('region', { name: 'Next patient' });

        await expect(card).toContainText('Fatima Zahra');
        await card.getByRole('button', { name: 'Mark done' }).click();
        await expect(card).toContainText('Ali Raza');
        await card.getByRole('button', { name: 'Call in and start' }).click();
        await expect(card).toContainText('In consultation');
        await expect(
            card.getByRole('button', { name: 'Mark done' }),
        ).toBeVisible();
    });

    test('opens a read-only panel for a patient', async ({ page }) => {
        await gotoIn(page, url('/doctor'), 'en');

        await page
            .getByRole('button', { name: 'Details, Zainab Hussain' })
            .click();
        const panel = page.getByRole('dialog');

        await expect(panel).toContainText('0345 1234570');
        await expect(panel).toContainText(
            'To change this appointment, ask reception.',
        );
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
    });

    test('the requests button goes to the requests page', async ({ page }) => {
        await gotoIn(page, url('/doctor'), 'en');

        await page
            .getByRole('link', { name: 'Reschedule requests, 2 waiting' })
            .click();

        await expect(page).toHaveURL(/\/doctor\/requests/);
    });
});

test.describe('My schedule', () => {
    test('shows the day with free time, opens a read-only panel, switches to the week', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor/schedule'), 'en');
        const grid = page.getByRole('table', { name: 'Day schedule' });

        await expect(grid.getByText('Free').first()).toBeVisible();
        await grid
            .getByRole('button', { name: /Zainab Hussain, Confirmed/ })
            .click();
        await expect(page.getByRole('dialog')).toContainText('Zainab Hussain');
        await page.keyboard.press('Escape');

        await page
            .getByRole('group', { name: 'Schedule view' })
            .getByRole('button', { name: 'Week' })
            .click();
        await expect(
            page.getByRole('table', { name: 'Week schedule' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page).toHaveURL(/date=/);
    });
});

test.describe('Availability', () => {
    test('a change updates the preview, warns about bookings, and saves', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor/availability'), 'en');
        const preview = page.getByRole('complementary');

        await expect(preview.getByText('13 slots')).toBeVisible();
        await page.getByRole('switch', { name: 'Tuesday' }).click();

        await expect(preview.getByText('0 slots')).toBeVisible();
        await expect(page.getByRole('alert')).toContainText(
            'This change affects existing bookings',
        );
        await expect(page.getByText('Unsaved changes')).toBeVisible();

        await page.getByRole('button', { name: 'Save anyway' }).click();
        await expect(page.getByText('Availability saved.')).toBeVisible();
        await expect(page.getByText('Unsaved changes')).toBeHidden();
    });

    test('steps hours, blocks a time and adds time off', async ({ page }) => {
        await gotoIn(page, url('/doctor/availability'), 'en');
        const monday = page
            .getByRole('switch', { name: 'Monday' })
            .locator('xpath=ancestor::*[@data-weekday]');

        await monday
            .getByRole('button', { name: 'Later by 30 minutes (From)' })
            .click();
        await expect(monday.getByText('09:30')).toBeVisible();

        const blocked = page
            .getByRole('heading', { name: 'Blocked slots' })
            .locator('xpath=ancestor::section');
        await blocked
            .getByRole('button', { name: '10:00', exact: true })
            .click();
        await expect(
            blocked.getByRole('button', { name: '10:00, Blocked' }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Add time off' }).click();
        await expect(
            page.getByText(
                'Choose a start and end date. The end cannot be before the start.',
            ),
        ).toBeVisible();
        await page.getByLabel('From date').fill('2026-12-01');
        await page.getByLabel('To date').fill('2026-12-02');
        await page.getByLabel('Reason').fill('Wedding');
        await page.getByRole('button', { name: 'Add time off' }).click();
        await expect(page.getByText('Wedding')).toBeVisible();
    });

    test('works with the keyboard: Tab to a switch and press Space', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor/availability'), 'en');
        await page.getByRole('switch', { name: 'Sunday' }).focus();
        await page.keyboard.press('Space');

        await expect(
            page.getByRole('switch', { name: 'Sunday' }),
        ).toBeChecked();
    });
});

test.describe('Requests', () => {
    test('approves one with a message and rejects the other', async ({
        page,
    }) => {
        await gotoIn(page, url('/doctor/requests'), 'en');
        await expect(
            page.getByRole('heading', { name: 'Waiting for you (2)' }),
        ).toBeVisible();

        const first = page.locator('[data-request="rq_1"]');
        await first
            .getByLabel('Message to reception (optional)')
            .fill('See you then');
        await first.getByRole('button', { name: /^Approve/ }).click();
        await expect(
            page.getByText(
                'Request approved. Reception and the patient are notified.',
            ),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Waiting for you (1)' }),
        ).toBeVisible();

        await page
            .locator('[data-request="rq_2"]')
            .getByRole('button', { name: /^Reject/ })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Waiting for you (0)' }),
        ).toBeVisible();
        await expect(page.getByText('No pending requests')).toBeVisible();
        await expect(
            page.getByRole('table', { name: 'History' }),
        ).toContainText('See you then');
    });
});
