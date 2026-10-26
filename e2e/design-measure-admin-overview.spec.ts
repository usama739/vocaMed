import { expect, test } from '@playwright/test';

// Compares computed styles on the admin Overview with values read from Overview.dc.html. Run on
// demand: it prints a table of differences instead of failing, so the list can go in the review.
test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });

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

const KPI = '#kpis-title + span';
const CARD = 'section[aria-labelledby="kpis-title"] > div:last-child > div';
const TREND = 'section[aria-labelledby="trend-title"]';
const SEGMENT = '[role=group][aria-label="Period"]';

const CHECKS: Check[] = [
    ['title size', 'h1', 'fontSize', '26'],
    ['title weight', 'h1', 'fontWeight', '700'],
    ['title colour', 'h1', 'color', '#071437'],
    ['period group radius', SEGMENT, 'borderTopLeftRadius', '12'],
    ['period group background', SEGMENT, 'backgroundColor', '#f9fafb'],
    ['period group padding', SEGMENT, 'paddingTop', '4'],
    ['period button height', `${SEGMENT} button`, 'height', '40'],
    ['period button size', `${SEGMENT} button`, 'fontSize', '14.5'],
    [
        'selected period background',
        `${SEGMENT} button[aria-pressed=true]`,
        'backgroundColor',
        '#ffffff',
    ],
    ['period heading size', '#kpis-title', 'fontSize', '18'],
    ['versus size', KPI, 'fontSize', '14'],
    ['kpi radius', CARD, 'borderTopLeftRadius', '14'],
    ['kpi padding vertical', CARD, 'paddingTop', '18'],
    ['kpi padding horizontal', CARD, 'paddingLeft', '20'],
    ['kpi border', CARD, 'borderTopColor', '#e4e7ee'],
    ['kpi value size', `${CARD} > span`, 'fontSize', '32'],
    ['kpi value weight', `${CARD} > span`, 'fontWeight', '700'],
    ['kpi icon box size', `${CARD} > div > span:first-child`, 'width', '36'],
    [
        'kpi icon box radius',
        `${CARD} > div > span:first-child`,
        'borderTopLeftRadius',
        '10',
    ],
    ['kpi label size', `${CARD} > div > span:last-child`, 'fontSize', '14'],
    ['trend radius', TREND, 'borderTopLeftRadius', '14'],
    ['trend padding', TREND, 'paddingTop', '20'],
    ['trend title size', '#trend-title', 'fontSize', '18'],
    ['chart height', '[data-testid=trend-chart]', 'height', '240'],
    [
        'insight card radius',
        'section[aria-labelledby="weekdays-title"]',
        'borderTopLeftRadius',
        '14',
    ],
    [
        'insight card padding',
        'section[aria-labelledby="weekdays-title"]',
        'paddingTop',
        '20',
    ],
    ['insight title size', '#weekdays-title', 'fontSize', '18'],
    [
        'today table radius',
        'section[aria-labelledby="today-title"] > div',
        'borderTopLeftRadius',
        '14',
    ],
    ['today title size', '#today-title', 'fontSize', '18'],
    [
        'today row min height',
        'section[aria-labelledby="today-title"] [role=row] >> nth=1',
        'minHeight',
        '64px',
    ],
    [
        'today header background',
        'section[aria-labelledby="today-title"] [role=row] >> nth=0',
        'backgroundColor',
        '#f9fafb',
    ],
    ['alert radius', '[role=alert] >> nth=0', 'borderTopLeftRadius', '12'],
    ['alert background', '[role=alert] >> nth=0', 'backgroundColor', '#fdf0f4'],
    ['alert action height', '[role=alert] a >> nth=0', 'height', '44'],
];

test('design values: admin overview', async ({ page, baseURL }) => {
    await page
        .context()
        .addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
    await page.goto('/admin?now=2026-10-26T05:15:00.000Z', {
        waitUntil: 'domcontentloaded',
    });
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByTestId('trend-chart').waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const rows: string[] = [];
    let off = 0;

    for (const [label, selector, prop, expected] of CHECKS) {
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

    console.log(`\n== overview (${off} differences)\n${rows.join('\n')}`);
    expect(rows.length).toBeGreaterThan(0);
});
