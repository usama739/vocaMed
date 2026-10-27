import { expect, test } from '@playwright/test';

// Compares computed styles on the patient pages with values read from the design files
// (PatientLink, PatientReschedule, PatientStatus, PatientExpired) at a phone width. Run on demand:
// it prints a table of differences instead of failing, so the list can go in the review.
test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

type Check = [label: string, selector: string, prop: string, expected: string];

const hex = (rgb: string) => {
    const m = rgb.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);

    if (!m) {
        return rgb;
    }

    if (m[4] !== undefined && Number(m[4]) === 0) {
        return 'transparent';
    }

    return (
        '#' +
        [m[1], m[2], m[3]]
            .map((n) => Number(n).toString(16).padStart(2, '0'))
            .join('')
    );
};

const H1_24: Check[] = [
    ['title size', 'h1', 'fontSize', '24'],
    ['title weight', 'h1', 'fontWeight', '700'],
    ['title colour', 'h1', 'color', '#071437'],
];

const HEADER: Check[] = [
    ['header background', 'header', 'backgroundColor', '#ffffff'],
    ['header border', 'header', 'borderBottomColor', '#e4e7ee'],
    ['header padding', 'header > div', 'paddingTop', '14'],
    ['brand mark size', 'header span[aria-hidden=true]', 'width', '36'],
    ['brand mark radius', 'header span[aria-hidden=true]', 'borderTopLeftRadius', '10'],
    ['clinic name size', 'header strong', 'fontSize', '16'],
    ['clinic name colour', 'header strong', 'color', '#071437'],
    ['main side padding', 'main', 'paddingLeft', '16'],
    ['main gap', 'main', 'rowGap', '16'],
];

const BTN = '[data-slot=patient-button]';
const CARD = 'section[aria-label="Appointment details"]';

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'manage',
        path: '/p/sample-booked',
        ready: 'section[aria-label="Appointment details"]',
        checks: [
            ...H1_24,
            ...HEADER,
            ['card radius', CARD, 'borderTopLeftRadius', '16'],
            ['card padding', CARD, 'paddingTop', '20'],
            ['card border', CARD, 'borderTopColor', '#e4e7ee'],
            ['avatar size', `${CARD} > div > span`, 'width', '48'],
            ['avatar background', `${CARD} > div > span`, 'backgroundColor', '#eaf2fe'],
            ['doctor name size', `${CARD} strong`, 'fontSize', '17'],
            ['when value size', `${CARD} dd >> nth=0`, 'fontSize', '17'],
            ['when value weight', `${CARD} dd >> nth=0`, 'fontWeight', '700'],
            ['label size', `${CARD} dt >> nth=0`, 'fontSize', '13'],
            ['confirm height', `${BTN} >> nth=0`, 'height', '56'],
            ['confirm radius', `${BTN} >> nth=0`, 'borderTopLeftRadius', '12'],
            ['confirm background', `${BTN} >> nth=0`, 'backgroundColor', '#1366d6'],
            ['confirm size', `${BTN} >> nth=0`, 'fontSize', '17'],
            ['confirm weight', `${BTN} >> nth=0`, 'fontWeight', '600'],
            ['reschedule border', `${BTN} >> nth=1`, 'borderTopColor', '#d5d9e3'],
            ['reschedule colour', `${BTN} >> nth=1`, 'color', '#071437'],
            ['cancel colour', `${BTN} >> nth=2`, 'color', '#9b1239'],
            ['cancel height', `${BTN} >> nth=2`, 'height', '56'],
            ['policy size', 'p:has-text("Free cancellation")', 'fontSize', '13.5'],
        ],
    },
    {
        name: 'reschedule',
        path: '/p/sample-booked/reschedule',
        ready: '[role=group][aria-labelledby=pick-day] button',
        checks: [
            ...H1_24,
            ['day chip height', '[aria-labelledby=pick-day] button >> nth=2', 'height', '68'],
            ['day chip min width', '[aria-labelledby=pick-day] button >> nth=2', 'width', '60'],
            ['day chip radius', '[aria-labelledby=pick-day] button >> nth=2', 'borderTopLeftRadius', '12'],
            ['day number size', '[aria-labelledby=pick-day] button >> nth=2 >> span >> nth=1', 'fontSize', '18'],
            ['selected day border', '[aria-labelledby=pick-day] button[aria-pressed=true]', 'borderTopWidth', '2'],
            ['selected day colour', '[aria-labelledby=pick-day] button[aria-pressed=true]', 'borderTopColor', '#1366d6'],
            ['selected day background', '[aria-labelledby=pick-day] button[aria-pressed=true]', 'backgroundColor', '#eaf2fe'],
            ['time height', '[aria-labelledby=pick-time] button >> nth=0', 'height', '56'],
            ['time radius', '[aria-labelledby=pick-time] button >> nth=0', 'borderTopLeftRadius', '12'],
            ['time size', '[aria-labelledby=pick-time] button >> nth=0', 'fontSize', '16'],
            ['time weight', '[aria-labelledby=pick-time] button >> nth=0', 'fontWeight', '700'],
            ['section heading size', '#pick-day', 'fontSize', '16'],
            ['submit height', `${BTN}`, 'height', '56'],
        ],
    },
    {
        name: 'status',
        path: '/p/sample-waiting/status',
        ready: 'section[aria-live=polite]',
        checks: [
            ...H1_24,
            ...HEADER,
            ['status card border', 'section[aria-live=polite]', 'borderTopWidth', '2'],
            ['status card radius', 'section[aria-live=polite]', 'borderTopLeftRadius', '16'],
            ['status card padding', 'section[aria-live=polite]', 'paddingTop', '22'],
            ['status icon size', 'section[aria-live=polite] > span', 'width', '64'],
            ['headline size', 'section[aria-live=polite] strong', 'fontSize', '22'],
            ['count number size', 'main .grid span >> nth=0', 'fontSize', '34'],
            ['count card radius', 'main .grid > div >> nth=0', 'borderTopLeftRadius', '12'],
            ['count card padding', 'main .grid > div >> nth=0', 'paddingTop', '16'],
        ],
    },
    {
        name: 'expired',
        path: '/p/sample-expired',
        ready: 'h1',
        checks: [
            ...H1_24,
            ...HEADER,
            ['icon size', 'main > span', 'width', '72'],
            ['icon background', 'main > span', 'backgroundColor', '#fff1cc'],
            ['icon colour', 'main > span', 'color', '#8a5a00'],
            ['text size', 'main > p >> nth=0', 'fontSize', '16'],
            ['request height', `${BTN} >> nth=0`, 'height', '56'],
            ['request background', `${BTN} >> nth=0`, 'backgroundColor', '#1366d6'],
            ['call height', `${BTN} >> nth=1`, 'height', '56'],
            ['call border', `${BTN} >> nth=1`, 'borderTopColor', '#d5d9e3'],
            ['why size', 'main > p >> nth=1', 'fontSize', '13'],
        ],
    },
];

for (const spec of PAGES) {
    test(`design values: ${spec.name}`, async ({ page, baseURL }) => {
        await page
            .context()
            .addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
        await page.goto(`${spec.path}?now=2026-10-26T05:15:00.000Z`, {
            waitUntil: 'domcontentloaded',
        });
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.locator(spec.ready).first().waitFor({ timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);

        const rows: string[] = [];
        let off = 0;

        for (const [label, selector, prop, expected] of spec.checks) {
            const loc = page.locator(selector).first();
            const actual = await loc
                .evaluate(
                    (el, property) =>
                        getComputedStyle(el)[property as never] as string,
                    prop,
                    { timeout: 3000 },
                )
                .catch(() => 'not found');
            const shown = actual.startsWith('rgb')
                ? hex(actual)
                : actual.replace(/px$/, '');
            const want = expected.replace(/px$/, '');
            const near =
                shown === want ||
                (!Number.isNaN(Number(shown)) &&
                    Math.abs(Number(shown) - Number(want)) <= 0.6);

            if (!near) {
                off++;
            }

            rows.push(
                `${near ? 'ok  ' : 'DIFF'} ${label.padEnd(34)} design ${want.padEnd(10)} ours ${shown}`,
            );
        }

        console.log(`\n== ${spec.name} (${off} differences)\n${rows.join('\n')}`);
        expect(rows.length).toBeGreaterThan(0);
    });
}
