import { expect, test } from '@playwright/test';

// Compares computed styles on the Account page with values read from Account.dc.html. Run on
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

const PROFILE = 'section[aria-labelledby="account-profile"]';
const PASSWORD = 'section[aria-labelledby="account-password"]';
const NOTIFY = 'section[aria-labelledby="account-notifications"]';
const SESSIONS = 'section[aria-labelledby="account-sessions"]';

const CHECKS: Check[] = [
    ['title size', 'h1', 'fontSize', '26'],
    ['title weight', 'h1', 'fontWeight', '700'],
    ['title colour', 'h1', 'color', '#071437'],
    ['page max width', 'main > div, [data-slot=page-body]', 'maxWidth', '860px'],
    ['card radius', PROFILE, 'borderTopLeftRadius', '14'],
    ['card border', PROFILE, 'borderTopColor', '#e4e7ee'],
    ['card padding', PROFILE, 'paddingTop', '24'],
    ['card title size', '#account-profile', 'fontSize', '18'],
    ['card title colour', '#account-profile', 'color', '#071437'],
    ['label size', `${PROFILE} label >> nth=0`, 'fontSize', '14'],
    ['label weight', `${PROFILE} label >> nth=0`, 'fontWeight', '600'],
    ['name input height', `${PROFILE} input >> nth=0`, 'height', '48'],
    ['name input radius', `${PROFILE} input >> nth=0`, 'borderTopLeftRadius', '10'],
    ['name input size', `${PROFILE} input >> nth=0`, 'fontSize', '16'],
    ['name input border', `${PROFILE} input >> nth=0`, 'borderTopColor', '#d5d9e3'],
    ['email background', `${PROFILE} input[readonly]`, 'backgroundColor', '#f4f6fa'],
    ['email colour', `${PROFILE} input[readonly]`, 'color', '#4b5675'],
    ['hint size', `${PROFILE} p >> nth=0`, 'fontSize', '13'],
    ['radio size', `${PROFILE} input[type=radio] >> nth=0`, 'width', '22'],
    ['radio row height', `${PROFILE} label:has(input[type=radio]) >> nth=0`, 'height', '48'],
    ['save height', `${PROFILE} button[type=submit]`, 'height', '48'],
    ['save radius', `${PROFILE} button[type=submit]`, 'borderTopLeftRadius', '10'],
    ['save size', `${PROFILE} button[type=submit]`, 'fontSize', '15'],
    ['save weight', `${PROFILE} button[type=submit]`, 'fontWeight', '600'],
    ['password form width', `${PASSWORD} form`, 'maxWidth', '420px'],
    ['password input height', `${PASSWORD} input >> nth=0`, 'height', '48'],
    ['change button height', `${PASSWORD} button[type=submit]`, 'height', '48'],
    ['notifications padding', NOTIFY, 'paddingTop', '24'],
    ['row label size', `${NOTIFY} [id^=account-n-] >> nth=0`, 'fontSize', '15'],
    ['row label weight', `${NOTIFY} [id^=account-n-] >> nth=0`, 'fontWeight', '600'],
    ['switch hit height', `${NOTIFY} [role=switch] >> nth=0`, 'height', '44'],
    ['sessions button height', `${SESSIONS} button >> nth=0`, 'height', '48'],
    ['sessions button colour', `${SESSIONS} button >> nth=0`, 'color', '#9b1239'],
    ['sessions button border', `${SESSIONS} button >> nth=0`, 'borderTopColor', '#d5d9e3'],
];

test('design values: account', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
    await page.goto('/account?role=clinic_admin&now=2026-10-26T05:15:00.000Z', {
        waitUntil: 'domcontentloaded',
    });
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.locator(PROFILE).waitFor({ timeout: 30_000 });
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

    console.log(`\n== account (${off} differences)\n${rows.join('\n')}`);
    expect(rows.length).toBeGreaterThan(0);
});
