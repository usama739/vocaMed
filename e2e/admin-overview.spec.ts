import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
    gotoIn,
    setLocaleCookie,
    sidewaysOverflow,
    smallTargets,
    watchConsole,
} from './helpers';

// Clinic admin: Overview. Reduced motion keeps screenshots and measurements deterministic, and
// the clock is pinned to Monday 10:15 in Karachi so the sample data lines up.
test.use({ reducedMotion: 'reduce' });

const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/clinic-admin';
mkdirSync(SHOTS, { recursive: true });

test.describe('Overview in both languages', () => {
    for (const locale of ['en', 'ur'] as const) {
        test(`overview (${locale}): loads clean, mirrors, fits, has 44px targets`, async ({
            page,
            baseURL,
        }) => {
            const problems = watchConsole(page);
            await setLocaleCookie(page, baseURL!, locale);

            for (const width of [1440, 820, 390]) {
                await page.setViewportSize({ width, height: 900 });
                await page.goto(url('/admin'), {
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
                ).toHaveText(locale === 'ur' ? 'جائزہ' : 'Overview');
                await expect(page.getByTestId('trend-chart')).toBeVisible();
                await page.waitForLoadState('networkidle');
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({
                    path: `${SHOTS}/overview-${locale}-${width}.png`,
                    fullPage: true,
                });

                expect(
                    await sidewaysOverflow(page),
                    `overview ${locale} ${width}px sideways overflow`,
                ).toBeLessThanOrEqual(0);
                expect(
                    await smallTargets(page),
                    `overview ${locale} ${width}px small targets`,
                ).toEqual([]);
            }

            expect(problems).toEqual([]);
        });
    }
});

test.describe('Overview', () => {
    test('shows the shell for the admin: seven items, the active page, the receptionist link', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin'), 'en');
        const nav = page.getByRole('navigation', { name: 'Main menu' });

        await expect(nav.locator('li a')).toHaveCount(7);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(
            'Overview',
        );
        await expect(
            page.getByRole('link', { name: /Receptionist Console/ }),
        ).toBeVisible();
    });

    test('the period switch changes the numbers and the address', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin'), 'en');
        await expect(page.getByText('vs 1–26 September')).toBeVisible();

        await page.getByRole('button', { name: 'Last 7 days' }).click();
        await expect(page.getByText('vs the 7 days before')).toBeVisible();
        await expect(page).toHaveURL(/period=last7/);

        await page.getByRole('button', { name: 'Last 3 months' }).click();
        await expect(page.getByText('vs the 3 months before')).toBeVisible();
        await expect(page.getByTestId('trend-chart')).toHaveAttribute(
            'aria-label',
            /13 points/,
        );
    });

    test('the trend chart shows a tooltip on hover and a table on request', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin?period=last7'), 'en');
        const chart = page.getByTestId('trend-chart');
        await expect(chart).toBeVisible();

        await chart.scrollIntoViewIfNeeded();
        const box = (await chart.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
        await expect(page.getByText('This period:')).toBeVisible();
        await expect(page.getByText('Previous period:')).toBeVisible();

        await page.getByRole('button', { name: 'Show as table' }).click();
        await expect(
            page.getByRole('table', { name: 'Bookings over time' }),
        ).toBeVisible();
        await expect(page.getByTestId('trend-chart')).toHaveCount(0);
    });

    test('the failed-messages alert leads to the receptionist notifications page', async ({
        page,
    }) => {
        await gotoIn(page, url('/admin'), 'en');

        await page
            .getByRole('link', { name: 'Review failed messages' })
            .click();
        await expect(page).toHaveURL(/\/reception\/notifications/);
    });

    test('shows loading, error and empty on request', async ({ page }) => {
        await gotoIn(page, url('/admin?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading the overview' }),
        ).toBeVisible();

        await gotoIn(page, url('/admin?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );

        await gotoIn(page, url('/admin?state=empty'), 'en');
        await expect(
            page.getByText('No appointments in this period yet'),
        ).toBeVisible();

        await gotoIn(page, url('/admin?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
    });
});
