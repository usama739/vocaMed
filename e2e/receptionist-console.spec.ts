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

// Receptionist console: Today, Appointments (list and detail), Calendar, Patients (list and
// profile) and Notifications. Reduced motion keeps screenshots and measurements deterministic.
// Data comes from the in-browser mock, so every full page load starts from the same seed.
test.use({ reducedMotion: 'reduce' });

// The mock data is seeded relative to "now", so every test starts on Monday 10:15 in Karachi.
const NOW = '2026-10-26T05:15:00.000Z';
const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}now=${NOW}`;

const SHOTS = 'storage/app/screenshots/receptionist-console';
mkdirSync(SHOTS, { recursive: true });

type PageSpec = {
    name: string;
    path: string;
    h1: Record<Locale, string>;
    /** Something that only shows once the data has loaded. */
    ready: string;
};

const PAGES: PageSpec[] = [
    {
        name: 'today',
        path: url('/reception'),
        h1: { en: 'Today', ur: 'آج' },
        ready: 'Dr. Sana Malik',
    },
    {
        name: 'appointments',
        path: url('/reception/appointments'),
        h1: { en: 'Appointments', ur: 'اپائنٹمنٹس' },
        ready: '22',
    },
    {
        name: 'appointment',
        path: url('/reception/appointments/a_004'),
        h1: { en: 'Appointment', ur: 'اپائنٹمنٹ' },
        ready: 'Zainab Hussain',
    },
    {
        name: 'calendar',
        path: url('/reception/calendar?date=2026-10-26'),
        h1: { en: 'Calendar', ur: 'کیلنڈر' },
        ready: 'Dr. Sana Malik',
    },
    {
        name: 'patients',
        path: url('/reception/patients'),
        h1: { en: 'Patients', ur: 'مریض' },
        ready: 'Zainab Hussain',
    },
    {
        name: 'patient',
        path: url('/reception/patients/p_4'),
        h1: { en: 'Zainab Hussain', ur: 'Zainab Hussain' },
        ready: 'Zainab Hussain',
    },
    {
        name: 'notifications',
        path: url('/reception/notifications'),
        h1: { en: 'Notifications', ur: 'اطلاعات' },
        ready: 'Booking confirmation',
    },
];

/** The first row that proves the page's data arrived (the mock answers after a short delay). */
async function waitForData(page: Page, spec: PageSpec, locale: Locale) {
    if (spec.name === 'appointments') {
        await expect(
            page.getByRole('status').filter({ hasText: '22' }),
        ).toBeVisible();

        return;
    }

    if (spec.name === 'notifications' || spec.name === 'patients') {
        await expect(
            page.getByRole('table').getByRole('row').nth(1),
        ).toBeVisible();

        return;
    }

    if (spec.name === 'calendar') {
        await expect(
            page.getByRole('table', { name: /Day schedule|دن کا شیڈول/ }),
        ).toBeVisible();
        await expect(page.getByText('Zainab Hussain').first()).toBeVisible();

        return;
    }

    await expect(page.getByText(spec.ready).first()).toBeVisible();
    void locale;
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
                    await waitForData(page, spec, locale);
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

test.describe('the shell around every page', () => {
    test('highlights the current page in the sidebar and shows the receptionist’s five items', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/calendar?date=2026-10-26'), 'en');
        const nav = page.getByRole('navigation', { name: 'Main menu' });

        await expect(nav.getByRole('link')).toHaveCount(6);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(
            'Calendar',
        );
        await expect(
            page.getByRole('button', { name: /New booking/ }),
        ).toBeVisible();
    });

    test('keeps the sidebar and the panel across navigation', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception'), 'en');
        await expect(page.getByText('Dr. Sana Malik').first()).toBeVisible();

        await page
            .getByRole('navigation', { name: 'Main menu' })
            .getByRole('link', { name: 'Patients' })
            .click();
        await expect(page).toHaveURL(/\/reception\/patients$/);
        await expect(
            page.getByRole('heading', { level: 1, name: 'Patients' }),
        ).toBeVisible();
    });

    test('N opens a new booking and M opens it already listening, Escape closes it', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception'), 'en');
        await expect(page.getByText('Dr. Sana Malik').first()).toBeVisible();

        await page.keyboard.press('n');
        const panel = page.getByRole('dialog', { name: 'New booking' });
        await expect(panel).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();

        await page.keyboard.press('m');
        await expect(panel).toBeVisible();
        await expect(panel.getByText('Listening… tap to stop')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
    });

    test('/ searches patients from the sidebar and opens the Patients page with the text', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception'), 'en');
        await expect(page.getByText('Dr. Sana Malik').first()).toBeVisible();

        await page.keyboard.press('/');
        await expect(
            page.getByRole('searchbox', { name: 'Search' }),
        ).toBeFocused();
        await page.keyboard.type('Zainab');
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/\/reception\/patients\?q=Zainab/);
        await expect(
            page.getByRole('searchbox', { name: 'Search by phone or name' }),
        ).toHaveValue('Zainab');
        await expect(
            page.getByRole('heading', { level: 2, name: 'Search results' }),
        ).toBeVisible();
    });

    test('the language switch mirrors the page and keeps you where you are', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/notifications'), 'en');
        await expect(
            page.getByText('Booking confirmation').first(),
        ).toBeVisible();

        await page.getByRole('button', { name: 'اردو' }).click();

        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(
            page.getByRole('heading', { level: 1, name: 'اطلاعات' }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/reception\/notifications/);
    });
});

test.describe('Today', () => {
    test('moves a patient through the day and undoes it', async ({ page }) => {
        await gotoIn(page, url('/reception'), 'en');
        const sana = page.getByRole('region', { name: 'Dr. Sana Malik' });
        const row = sana
            .getByRole('listitem')
            .filter({ hasText: 'Zainab Hussain' });

        await expect(row).toHaveAttribute('data-status', 'confirmed');
        await row.getByRole('button', { name: 'Arrived' }).click();
        await expect(row).toHaveAttribute('data-status', 'arrived');
        await expect(
            row.getByRole('button', { name: 'Arrived' }),
        ).toHaveAttribute('aria-pressed', 'true');

        await row.getByRole('button', { name: 'Arrived' }).click();
        await expect(row).toHaveAttribute('data-status', 'confirmed');
    });

    test('adds a walk-in with a name only', async ({ page }) => {
        await gotoIn(page, url('/reception'), 'en');
        await expect(page.getByText('Dr. Sana Malik').first()).toBeVisible();

        await page.getByLabel('Walk-in patient').fill('Hira Anwar');
        await page.getByRole('button', { name: 'Add walk-in' }).click();

        await expect(page.getByText('Hira Anwar').first()).toBeVisible();
        await expect(
            page.getByText('Hira Anwar added to Dr. Sana Malik’s queue.'),
        ).toBeVisible();
    });

    test('a doctor with nothing booked offers to book a time, for that doctor', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception'), 'en');
        const hina = page.getByRole('region', { name: 'Dr. Hina Farooq' });

        await hina.getByRole('button', { name: 'Book a time' }).click();

        const panel = page.getByRole('dialog', { name: 'New booking' });
        await expect(panel).toBeVisible();
        await panel.getByRole('tab', { name: 'Manual' }).waitFor();
        await expect(
            panel.getByRole('button', { name: 'Dr. Hina Farooq' }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('shows loading, error and reconnecting on request', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception?state=loading'), 'en');
        await expect(
            page.getByRole('status', { name: 'Loading today’s schedule' }),
        ).toBeVisible();

        await gotoIn(page, url('/reception?state=error'), 'en');
        await expect(page.getByRole('alert')).toContainText(
            'Something went wrong',
        );
        await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

        await gotoIn(page, url('/reception?state=reconnecting'), 'en');
        await expect(page.getByText(/Reconnecting/)).toBeVisible();
        await expect(page.getByText('Dr. Sana Malik').first()).toBeVisible();
    });
});

test.describe('Appointments', () => {
    test('filters, keeps the filters in the address and cancels with a confirmation', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/appointments'), 'en');
        await expect(page.getByText('22 appointments')).toBeVisible();

        await page
            .getByRole('group', { name: 'Doctor' })
            .getByRole('button', { name: 'Dr. Hina Farooq' })
            .click();
        await expect(page.getByText('3 appointments')).toBeVisible();
        await expect(page).toHaveURL(/doctor=d_hina/);

        await page.reload();
        await expect(page.getByText('3 appointments')).toBeVisible();

        await page
            .getByRole('button', { name: /^Cancel .*’s appointment$/ })
            .first()
            .click();
        const dialog = page.getByRole('alertdialog');
        await expect(
            dialog.getByRole('button', { name: 'Keep appointment' }),
        ).toBeFocused();
        await dialog.getByRole('button', { name: 'Yes, cancel it' }).click();
        await expect(page.getByText('Appointment cancelled.')).toBeVisible();
    });

    test('reschedules from the list: the panel keeps the patient and only asks for a new time', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/appointments'), 'en');
        await expect(page.getByText('22 appointments')).toBeVisible();

        await page
            .getByRole('button', { name: /^Reschedule / })
            .first()
            .click();

        const panel = page.getByRole('dialog', { name: 'Reschedule' });
        await expect(panel).toBeVisible();
        await expect(panel.getByText('Currently')).toBeVisible();
        await expect(panel.getByRole('tab')).toHaveCount(0);

        // Pick the first free time on the first day that has one.
        const days = panel
            .getByRole('group', { name: 'Date' })
            .getByRole('button');

        for (let i = 0; i < (await days.count()); i++) {
            await days.nth(i).click();
            const free = panel
                .getByRole('group', { name: 'Time' })
                .getByRole('button')
                .and(page.locator(':not([disabled])'))
                .first();

            if (await free.isVisible().catch(() => false)) {
                await free.click();
                break;
            }
        }

        await panel.getByRole('button', { name: 'Confirm new time' }).click();
        await expect(panel.getByText('Appointment moved')).toBeVisible();
    });

    test('searching with no match shows the empty state, and Clear filters brings everything back', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/appointments'), 'en');
        await expect(page.getByText('22 appointments')).toBeVisible();

        await page
            .getByRole('searchbox', { name: 'Search by patient name or phone' })
            .fill('zzzzzz');
        await expect(page.getByText('No appointments match')).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters' }).click();
        await expect(page.getByText('22 appointments')).toBeVisible();
    });

    test('opens an appointment, marks it arrived, and the history grows', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/appointments/a_004'), 'en');
        await expect(page.getByText('Zainab Hussain').first()).toBeVisible();

        await page.getByRole('button', { name: 'Mark arrived' }).click();
        await expect(page.getByText('Marked as arrived.')).toBeVisible();
        await expect(page.getByText('Marked as arrived').first()).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Mark arrived' }),
        ).toHaveCount(0);
    });

    test('says when an appointment does not exist', async ({ page }) => {
        await gotoIn(page, url('/reception/appointments/a_999'), 'en');

        await expect(page.getByText('Appointment not found')).toBeVisible();
        await page.getByRole('link', { name: 'Back to the list' }).click();
        await expect(page).toHaveURL(/\/reception\/appointments$/);
    });
});

test.describe('Calendar', () => {
    test('a free slot opens the booking panel on that doctor and time, held for you', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/calendar?date=2026-10-26'), 'en');
        const grid = page.getByRole('table', { name: 'Day schedule' });
        await expect(grid.getByText('Zainab Hussain')).toBeVisible();

        await grid
            .getByRole('button', { name: /^Book 1\d:\d\d, Dr\. Sana Malik$/ })
            .first()
            .click();

        const panel = page.getByRole('dialog', { name: 'New booking' });
        await expect(panel).toBeVisible();
        await expect(
            panel.getByRole('button', { name: 'Dr. Sana Malik' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(panel.getByRole('timer')).toBeVisible();
    });

    test('moves an appointment by selecting it, choosing a free slot and confirming', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/calendar?date=2026-10-26'), 'en');
        const grid = page.getByRole('table', { name: 'Day schedule' });

        await grid
            .getByRole('button', { name: /Zainab Hussain, Confirmed/ })
            .click();
        await expect(
            page.getByText('Moving Zainab Hussain. Choose a free slot.'),
        ).toBeVisible();

        await grid
            .getByRole('button', {
                name: /^Move to \d\d:\d\d, Dr\. Sana Malik$/,
            })
            .last()
            .click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog.getByText('Move this appointment?')).toBeVisible();
        await dialog.getByRole('button', { name: 'Yes, move it' }).click();

        await expect(
            page.getByText(
                'Appointment moved. The patient will be sent the new time.',
            ),
        ).toBeVisible();
        await expect(
            grid.getByRole('button', { name: /Zainab Hussain, Booked/ }),
        ).toBeVisible();
    });

    test('moves an appointment by dragging it onto a free slot', async ({
        page,
        isMobile,
    }) => {
        test.skip(!!isMobile, 'Touch devices use select-then-choose.');
        await gotoIn(page, url('/reception/calendar?date=2026-10-26'), 'en');
        const grid = page.getByRole('table', { name: 'Day schedule' });
        const event = grid.getByRole('button', {
            name: /Zainab Hussain, Confirmed/,
        });
        await expect(event).toBeVisible();

        // Headless Chromium does not start a native drag from a pointer reliably, so the drag
        // is replayed with the same events a browser sends: dragstart, dragover, drop, dragend.
        await event.evaluate(async (node) => {
            const data = new DataTransfer();
            node.dispatchEvent(
                new DragEvent('dragstart', {
                    bubbles: true,
                    dataTransfer: data,
                }),
            );
            await new Promise((resolve) => setTimeout(resolve, 200));
            const cells = [
                ...document.querySelectorAll('[role=table] button'),
            ].filter((b) =>
                /^Move to/.test(b.getAttribute('aria-label') ?? ''),
            );
            const cell = cells[0].closest('[role=cell]')!;
            cell.dispatchEvent(
                new DragEvent('dragover', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: data,
                }),
            );
            cell.dispatchEvent(
                new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: data,
                }),
            );
            node.dispatchEvent(
                new DragEvent('dragend', { bubbles: true, dataTransfer: data }),
            );
        });

        await expect(page.getByRole('alertdialog')).toContainText(
            'The patient will be messaged.',
        );
    });

    test('switches between day, week and month, and steps through time', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/calendar?date=2026-10-26'), 'en');
        await expect(page.getByText('Monday, 26 October 2026')).toBeVisible();

        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page.getByText('Tuesday, 27 October 2026')).toBeVisible();

        const views = page.getByRole('group', { name: 'Calendar view' });
        await views.getByRole('button', { name: 'Week' }).click();
        const week = page.getByRole('table', { name: 'Week schedule' });
        await expect(week).toBeVisible();
        await expect(week.getByRole('columnheader')).toHaveCount(7);

        await views.getByRole('button', { name: 'Month' }).click();
        await expect(page.getByText('October 2026')).toBeVisible();
        await page
            .getByRole('table', { name: 'Month overview' })
            .getByRole('cell', { name: /27 Oct/ })
            .click();
        await expect(
            page.getByRole('table', { name: 'Day schedule' }),
        ).toBeVisible();
    });
});

test.describe('Patients', () => {
    test('finds a patient by phone, opens the profile, edits, saves and books for them', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/patients'), 'en');
        await expect(
            page.getByRole('table').getByRole('row').nth(1),
        ).toBeVisible();

        await page.keyboard.press('/');
        await page.keyboard.type('0345 1234570');
        const result = page.getByRole('table').getByRole('row').nth(1);
        await expect(result).toContainText('Zainab Hussain');
        await result.getByRole('link', { name: /^Open / }).click();

        await expect(
            page.getByRole('heading', { level: 1, name: 'Zainab Hussain' }),
        ).toBeVisible();
        const save = page.getByRole('button', { name: 'Save changes' });
        await expect(save).toBeDisabled();
        await page.getByLabel('Notes (non-clinical)').fill('Prefers mornings');
        await expect(page.getByText('Unsaved changes')).toBeVisible();
        await save.click();
        await expect(page.getByText('Patient details saved.')).toBeVisible();
        await expect(save).toBeDisabled();

        await page
            .getByRole('button', { name: 'Book appointment' })
            .first()
            .click();
        const panel = page.getByRole('dialog', { name: 'New booking' });
        await expect(
            panel.getByRole('button', { name: /Zainab Hussain/ }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    test('adds a new patient and lists them first', async ({ page }) => {
        await gotoIn(page, url('/reception/patients'), 'en');
        await expect(
            page.getByRole('table').getByRole('row').nth(1),
        ).toBeVisible();

        await page.getByRole('button', { name: 'New patient' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Save patient' }).click();
        await expect(
            dialog.getByText('Enter the patient’s name.'),
        ).toBeVisible();

        await dialog.getByLabel('Full name').fill('Sara Khan');
        await dialog.getByLabel('Mobile phone').fill('0300 5551234');
        await dialog.getByRole('button', { name: 'Save patient' }).click();

        await expect(page.getByText('Sara Khan added.')).toBeVisible();
        await expect(
            page.getByRole('table').getByRole('row').nth(1),
        ).toContainText('Sara Khan');
    });

    test('shows not found for a patient who does not exist', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/patients/p_999'), 'en');

        await expect(page.getByText('Patient not found')).toBeVisible();
    });
});

test.describe('Notifications', () => {
    test('warns about failed messages, filters to them and resends one', async ({
        page,
    }) => {
        await gotoIn(page, url('/reception/notifications'), 'en');
        const banner = page
            .getByRole('alert')
            .filter({ hasText: 'not delivered' });
        await expect(banner).toBeVisible();
        const before = await banner.innerText();

        await banner.getByRole('button', { name: 'Show failed only' }).click();
        await expect(page).toHaveURL(/status=failed/);
        const table = page.getByRole('table', { name: 'Notifications' });
        await expect(table.getByRole('row').nth(1)).toContainText('Failed');

        await table
            .getByRole('button', { name: /^Resend to / })
            .first()
            .click();
        await expect(
            page.getByText(/^Message queued again for /),
        ).toBeVisible();
        await expect(table.getByText('Resent')).toBeVisible();
        await expect(banner).not.toHaveText(before);
    });
});

test.describe('on a tablet and a phone', () => {
    test('Today reflows its rows instead of scrolling sideways', async ({
        page,
    }) => {
        for (const width of [820, 390]) {
            await page.setViewportSize({ width, height: 900 });
            await gotoIn(page, url('/reception'), 'en');
            await expect(
                page.getByText('Dr. Sana Malik').first(),
            ).toBeVisible();

            expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
            const row = page
                .getByRole('region', { name: 'Dr. Sana Malik' })
                .getByRole('listitem')
                .first();
            await expect(
                row.getByRole('button', { name: 'Arrived' }),
            ).toBeVisible();
        }
    });

    test('the menu opens as a drawer', async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 900 });
        await gotoIn(page, url('/reception'), 'en');

        await page.getByRole('button', { name: 'Open menu' }).click();
        const nav = page.getByRole('navigation', { name: 'Main menu' });
        await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
        await nav.getByRole('link', { name: 'Calendar' }).click();
        await expect(page).toHaveURL(/\/reception\/calendar/);
    });
});
