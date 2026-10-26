import { expect, test } from '@playwright/test';

// Compares computed styles on the admin Doctors and Doctor profile pages with values read from the
// design files (Doctors, Doctor). Run on demand: it prints a table of differences instead of
// failing, so the list can go in the review.
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

const H1: Check[] = [
    ['title size', 'h1', 'fontSize', '26'],
    ['title weight', 'h1', 'fontWeight', '700'],
    ['title colour', 'h1', 'color', '#071437'],
];

const ROW = '[data-doctor="d_sana"]';
const TABLE = 'xpath=//div[@role="table"]/..';
const PROFILE = 'section[aria-labelledby="doctor-profile"]';

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'doctors',
        path: '/admin/doctors',
        ready: ROW,
        checks: [
            ...H1,
            [
                'add button height',
                'main a[href="/admin/doctors/new"]',
                'height',
                '48',
            ],
            [
                'add button radius',
                'main a[href="/admin/doctors/new"]',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'add button background',
                'main a[href="/admin/doctors/new"]',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'add button size',
                'main a[href="/admin/doctors/new"]',
                'fontSize',
                '15',
            ],
            ['search height', 'input[type=search]', 'height', '48'],
            [
                'search radius',
                'input[type=search]',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'search border',
                'input[type=search]',
                'borderTopColor',
                '#d5d9e3',
            ],
            ['search size', 'input[type=search]', 'fontSize', '15'],
            ['status select height', 'select', 'height', '48'],
            ['status select width', 'select', 'width', '200'],
            ['table radius', TABLE, 'borderTopLeftRadius', '14'],
            ['table border', TABLE, 'borderTopColor', '#e4e7ee'],
            [
                'header background',
                '[role=row] >> nth=0',
                'backgroundColor',
                '#f9fafb',
            ],
            ['header padding', '[role=row] >> nth=0', 'paddingTop', '12'],
            ['header size', '[role=columnheader] >> nth=0', 'fontSize', '13'],
            [
                'header weight',
                '[role=columnheader] >> nth=0',
                'fontWeight',
                '600',
            ],
            [
                'header colour',
                '[role=columnheader] >> nth=0',
                'color',
                '#5b6781',
            ],
            ['row min height', ROW, 'minHeight', '72px'],
            ['row padding', ROW, 'paddingTop', '10'],
            [
                'avatar size',
                `${ROW} [aria-hidden=true] >> nth=0`,
                'width',
                '40',
            ],
            [
                'avatar background',
                `${ROW} [aria-hidden=true] >> nth=0`,
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'avatar colour',
                `${ROW} [aria-hidden=true] >> nth=0`,
                'color',
                '#0b4491',
            ],
            [
                'avatar text size',
                `${ROW} [aria-hidden=true] >> nth=0`,
                'fontSize',
                '14',
            ],
            ['name size', `${ROW} a >> nth=0`, 'fontSize', '15'],
            ['name weight', `${ROW} a >> nth=0`, 'fontWeight', '600'],
            ['name colour', `${ROW} a >> nth=0`, 'color', '#071437'],
            ['name hit height', `${ROW} a >> nth=0`, 'height', '44'],
            [
                'status pill padding',
                `${ROW} [role=cell] span:has-text("Active")`,
                'paddingTop',
                '5',
            ],
            [
                'status pill background',
                `${ROW} [role=cell] span:has-text("Active")`,
                'backgroundColor',
                '#dff3e4',
            ],
            [
                'status pill colour',
                `${ROW} [role=cell] span:has-text("Active")`,
                'color',
                '#14532d',
            ],
            [
                'status pill size',
                `${ROW} [role=cell] span:has-text("Active")`,
                'fontSize',
                '13.5',
            ],
            ['open button height', `${ROW} a:has-text("Open")`, 'height', '44'],
            [
                'open button radius',
                `${ROW} a:has-text("Open")`,
                'borderTopLeftRadius',
                '10',
            ],
            [
                'open button border',
                `${ROW} a:has-text("Open")`,
                'borderTopColor',
                '#d5d9e3',
            ],
            ['open button size', `${ROW} a:has-text("Open")`, 'fontSize', '14'],
            [
                'deactivate colour',
                `${ROW} button:has-text("Deactivate")`,
                'color',
                '#9b1239',
            ],
            [
                'deactivate weight',
                `${ROW} button:has-text("Deactivate")`,
                'fontWeight',
                '600',
            ],
            ['count size', 'p:has-text("Showing")', 'fontSize', '14'],
            ['count colour', 'p:has-text("Showing")', 'color', '#5b6781'],
        ],
    },
    {
        name: 'doctor',
        path: '/admin/doctors/d_sana',
        ready: '[data-weekday]',
        checks: [
            ...H1,
            [
                'avatar size',
                'main span[aria-hidden=true] >> nth=0',
                'width',
                '64',
            ],
            [
                'avatar background',
                'main span[aria-hidden=true] >> nth=0',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'avatar text size',
                'main span[aria-hidden=true] >> nth=0',
                'fontSize',
                '22',
            ],
            ['active label size', '#doctor-active-label', 'fontSize', '15'],
            [
                'active label weight',
                '#doctor-active-label',
                'fontWeight',
                '600',
            ],
            [
                'active switch hit height',
                '[role=switch] >> nth=0',
                'height',
                '44',
            ],
            ['profile card radius', PROFILE, 'borderTopLeftRadius', '14'],
            ['profile card padding', PROFILE, 'paddingTop', '24'],
            ['profile card border', PROFILE, 'borderTopColor', '#e4e7ee'],
            ['profile heading size', '#doctor-profile', 'fontSize', '18'],
            ['name input height', 'input[type=text] >> nth=0', 'height', '48'],
            [
                'name input radius',
                'input[type=text] >> nth=0',
                'borderTopLeftRadius',
                '10',
            ],
            ['name input size', 'input[type=text] >> nth=0', 'fontSize', '16'],
            ['label size', 'label >> nth=0', 'fontSize', '14'],
            ['label weight', 'label >> nth=0', 'fontWeight', '600'],
            [
                'language chip height',
                `${PROFILE} button[aria-pressed] >> nth=0`,
                'height',
                '44',
            ],
            [
                'language chip radius',
                `${PROFILE} button[aria-pressed] >> nth=0`,
                'borderTopLeftRadius',
                '999',
            ],
            [
                'language chip size',
                `${PROFILE} button[aria-pressed] >> nth=0`,
                'fontSize',
                '15',
            ],
            [
                'language chip on border',
                `${PROFILE} button[aria-pressed=true] >> nth=0`,
                'borderTopColor',
                '#1366d6',
            ],
            [
                'language chip on background',
                `${PROFILE} button[aria-pressed=true] >> nth=0`,
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'language chip on colour',
                `${PROFILE} button[aria-pressed=true] >> nth=0`,
                'color',
                '#0b4491',
            ],
            [
                'service row height',
                `${PROFILE} label:has([role=checkbox]) >> nth=0`,
                'minHeight',
                '48px',
            ],
            [
                'service row size',
                `${PROFILE} label:has([role=checkbox]) >> nth=0`,
                'fontSize',
                '15',
            ],
            [
                'checkbox size',
                `${PROFILE} [role=checkbox] >> nth=0`,
                'width',
                '22',
            ],
            [
                'availability heading size',
                '#doctor-availability',
                'fontSize',
                '18',
            ],
            ['day row min height', '[data-weekday="1"]', 'minHeight', '60px'],
            ['day name size', '[data-weekday="1"] > span', 'fontSize', '15'],
            [
                'stepper height',
                '[data-weekday="1"] [role=group] button >> nth=0',
                'height',
                '44',
            ],
            [
                'stepper radius',
                '[data-weekday="1"] [role=group] button >> nth=0',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'stepper value size',
                '[data-weekday="1"] [role=group] span[dir=ltr] >> nth=0',
                'fontSize',
                '15',
            ],
            [
                'preview radius',
                'aside[aria-labelledby="preview-title"]',
                'borderTopLeftRadius',
                '12',
            ],
            [
                'preview background',
                'aside[aria-labelledby="preview-title"]',
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'preview padding',
                'aside[aria-labelledby="preview-title"]',
                'paddingTop',
                '18',
            ],
            ['preview heading size', '#preview-title', 'fontSize', '16'],
            ['date input height', 'input[type=date] >> nth=0', 'height', '48'],
            [
                'date input radius',
                'input[type=date] >> nth=0',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'time off card radius',
                'section[aria-labelledby="time-off"]',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'time off card padding',
                'section[aria-labelledby="time-off"]',
                'paddingTop',
                '24',
            ],
            [
                'save height',
                'main button:has-text("Save changes")',
                'height',
                '48',
            ],
            [
                'save radius',
                'main button:has-text("Save changes")',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'save size',
                'main button:has-text("Save changes")',
                'fontSize',
                '15',
            ],
            [
                'discard height',
                'main button:has-text("Discard changes")',
                'height',
                '48',
            ],
            [
                'discard border',
                'main button:has-text("Discard changes")',
                'borderTopColor',
                '#d5d9e3',
            ],
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
        await page.waitForLoadState('networkidle');
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
                    Math.abs(Number(shown) - Number(want)) <= 0.6) ||
                // A fully rounded pill is a huge radius in computed style.
                (want === '999' && Number(shown) >= 999);

            if (!near) {
                off++;
            }

            rows.push(
                `${near ? 'ok  ' : 'DIFF'} ${label.padEnd(34)} design ${want.padEnd(10)} ours ${shown}`,
            );
        }

        console.log(
            `\n== ${spec.name} (${off} differences)\n${rows.join('\n')}`,
        );
        expect(rows.length).toBeGreaterThan(0);
    });
}
