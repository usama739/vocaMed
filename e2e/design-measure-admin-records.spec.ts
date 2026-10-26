import { expect, test } from '@playwright/test';

// Compares computed styles on the admin records pages with values read from the design files
// (Templates, Audit). Run on demand: it prints a table of differences instead of failing, so the
// list can go in the review.
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

const EDITOR = '#template-panel';
const FILTERS = 'div:has(> [role=group][aria-label="Date"])';
const TABLE = '[role=table]';

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'templates',
        path: '/admin/templates',
        ready: '[role=tablist]',
        checks: [
            ...H1,
            ['tab height', '[role=tab] >> nth=0', 'height', '48'],
            ['tab radius', '[role=tab] >> nth=0', 'borderTopLeftRadius', '10'],
            ['tab size', '[role=tab] >> nth=0', 'fontSize', '15'],
            ['tab weight', '[role=tab] >> nth=0', 'fontWeight', '600'],
            [
                'tab selected border',
                '[role=tab][aria-selected=true]',
                'borderTopColor',
                '#1366d6',
            ],
            [
                'tab selected bg',
                '[role=tab][aria-selected=true]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'tab selected colour',
                '[role=tab][aria-selected=true]',
                'color',
                '#0b4491',
            ],
            [
                'tab idle border',
                '[role=tab][aria-selected=false] >> nth=0',
                'borderTopColor',
                '#d5d9e3',
            ],
            ['editor radius', EDITOR, 'borderTopLeftRadius', '14'],
            ['editor padding', EDITOR, 'paddingTop', '24'],
            ['editor border', EDITOR, 'borderTopColor', '#e4e7ee'],
            ['editor gap', EDITOR, 'rowGap', '18'],
            [
                'segmented radius',
                `${EDITOR} [role=group] > div >> nth=0`,
                'borderTopLeftRadius',
                '10',
            ],
            [
                'segmented padding',
                `${EDITOR} [role=group] > div >> nth=0`,
                'paddingTop',
                '3',
            ],
            [
                'segmented bg',
                `${EDITOR} [role=group] > div >> nth=0`,
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'segment height',
                `${EDITOR} [role=group] button >> nth=0`,
                'height',
                '40',
            ],
            [
                'segment min width',
                `${EDITOR} [role=group] button >> nth=0`,
                'minWidth',
                '84px',
            ],
            [
                'segment size',
                `${EDITOR} [role=group] button >> nth=0`,
                'fontSize',
                '14',
            ],
            [
                'segment radius',
                `${EDITOR} [role=group] button >> nth=0`,
                'borderTopLeftRadius',
                '8',
            ],
            [
                'message radius',
                `${EDITOR} textarea`,
                'borderTopLeftRadius',
                '10',
            ],
            ['message size', `${EDITOR} textarea`, 'fontSize', '16'],
            ['message padding', `${EDITOR} textarea`, 'paddingTop', '12'],
            [
                'message border',
                `${EDITOR} textarea`,
                'borderTopColor',
                '#d5d9e3',
            ],
            [
                'counter size',
                'xpath=//section[@id="template-panel"]//textarea/ancestor::div[contains(@class,"grid")][1]/following-sibling::div[1]',
                'fontSize',
                '13.5',
            ],
            [
                'variable height',
                `${EDITOR} button:has-text("{patient_name}")`,
                'height',
                '44',
            ],
            [
                'variable bg',
                `${EDITOR} button:has-text("{patient_name}")`,
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'variable colour',
                `${EDITOR} button:has-text("{patient_name}")`,
                'color',
                '#0b4491',
            ],
            [
                'variable border',
                `${EDITOR} button:has-text("{patient_name}")`,
                'borderTopColor',
                '#c9d6ee',
            ],
            [
                'variable size',
                `${EDITOR} button:has-text("{patient_name}")`,
                'fontSize',
                '14',
            ],
            [
                'reset height',
                `${EDITOR} button:has-text("Reset to default")`,
                'height',
                '48',
            ],
            [
                'save height',
                `${EDITOR} button:has-text("Save template")`,
                'height',
                '48',
            ],
            [
                'preview card radius',
                'section[aria-labelledby="template-preview"] > div >> nth=0',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'preview card padding',
                'section[aria-labelledby="template-preview"] > div >> nth=0',
                'paddingTop',
                '24',
            ],
            [
                'preview card bg',
                'section[aria-labelledby="template-preview"] > div >> nth=0',
                'backgroundColor',
                '#f9fafb',
            ],
            ['preview title size', '#template-preview', 'fontSize', '18'],
            [
                'bubble radius',
                '[role=region][aria-label="Message preview"]',
                'borderTopLeftRadius',
                '16',
            ],
            [
                'bubble padding',
                '[role=region][aria-label="Message preview"]',
                'paddingTop',
                '14',
            ],
            [
                'bubble size',
                '[role=region][aria-label="Message preview"]',
                'fontSize',
                '16',
            ],
            [
                'bubble border',
                '[role=region][aria-label="Message preview"]',
                'borderTopColor',
                '#e4e7ee',
            ],
            [
                'test card radius',
                'section[aria-labelledby="template-preview"] > div >> nth=1',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'test card padding',
                'section[aria-labelledby="template-preview"] > div >> nth=1',
                'paddingTop',
                '24',
            ],
            ['phone height', 'input[type=tel]', 'height', '48'],
            ['phone radius', 'input[type=tel]', 'borderTopLeftRadius', '10'],
            [
                'send height',
                'button:has-text("Send test message")',
                'height',
                '48',
            ],
        ],
    },
    {
        name: 'audit',
        path: '/admin/audit',
        ready: `${TABLE} [data-audit]`,
        checks: [
            ...H1,
            ['filter panel radius', FILTERS, 'borderTopLeftRadius', '14'],
            ['filter panel padding', FILTERS, 'paddingTop', '18'],
            ['filter panel bg', FILTERS, 'backgroundColor', '#f9fafb'],
            ['filter panel border', FILTERS, 'borderTopColor', '#e4e7ee'],
            ['filter panel gap', FILTERS, 'rowGap', '14'],
            [
                'filter label width',
                '[role=group][aria-label="Date"] > span',
                'minWidth',
                '90px',
            ],
            [
                'filter label size',
                '[role=group][aria-label="Date"] > span',
                'fontSize',
                '14',
            ],
            [
                'chip height',
                '[role=group][aria-label="Date"] button >> nth=0',
                'height',
                '44',
            ],
            [
                'chip size',
                '[role=group][aria-label="Date"] button >> nth=0',
                'fontSize',
                '14.5',
            ],
            [
                'chip weight',
                '[role=group][aria-label="Date"] button >> nth=0',
                'fontWeight',
                '600',
            ],
            [
                'chip selected bg',
                '[role=group][aria-label="Date"] button[aria-pressed=true]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'chip selected border',
                '[role=group][aria-label="Date"] button[aria-pressed=true]',
                'borderTopColor',
                '#1366d6',
            ],
            [
                'chip selected colour',
                '[role=group][aria-label="Date"] button[aria-pressed=true]',
                'color',
                '#0b4491',
            ],
            [
                'chip idle border',
                '[role=group][aria-label="Date"] button[aria-pressed=false] >> nth=0',
                'borderTopColor',
                '#d5d9e3',
            ],
            ['count size', '[role=status]', 'fontSize', '14.5'],
            ['count weight', '[role=status]', 'fontWeight', '600'],
            [
                'table radius',
                'xpath=//*[@role="table"]/..',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'table border',
                'xpath=//*[@role="table"]/..',
                'borderTopColor',
                '#e4e7ee',
            ],
            ['table min width', TABLE, 'minWidth', '900px'],
            [
                'header padding',
                `${TABLE} [role=row] >> nth=0`,
                'paddingTop',
                '12',
            ],
            [
                'header bg',
                `${TABLE} [role=row] >> nth=0`,
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'header size',
                `${TABLE} [role=columnheader] >> nth=0`,
                'fontSize',
                '13',
            ],
            [
                'header colour',
                `${TABLE} [role=columnheader] >> nth=0`,
                'color',
                '#5b6781',
            ],
            ['header gap', `${TABLE} [role=row] >> nth=0`, 'columnGap', '16'],
            [
                'row min height',
                `${TABLE} [data-audit] >> nth=0`,
                'minHeight',
                '68px',
            ],
            [
                'row padding',
                `${TABLE} [data-audit] >> nth=0`,
                'paddingTop',
                '10',
            ],
            [
                'row border',
                `${TABLE} [data-audit] >> nth=0`,
                'borderBottomColor',
                '#eef0f5',
            ],
            [
                'day size',
                `${TABLE} [data-audit] [role=cell] >> nth=0 >> span >> nth=0`,
                'fontSize',
                '14.5',
            ],
            [
                'day weight',
                `${TABLE} [data-audit] [role=cell] >> nth=0 >> span >> nth=0`,
                'fontWeight',
                '600',
            ],
            [
                'time size',
                `${TABLE} [data-audit] [role=cell] >> nth=0 >> span >> nth=1`,
                'fontSize',
                '13.5',
            ],
            [
                'user size',
                `${TABLE} [data-audit] [role=cell] >> nth=1`,
                'fontSize',
                '15',
            ],
            [
                'user colour',
                `${TABLE} [data-audit] [role=cell] >> nth=1`,
                'color',
                '#071437',
            ],
            [
                'action pill bg',
                `${TABLE} [data-audit] [role=cell] >> nth=2 >> span`,
                'backgroundColor',
                '#eef1f6',
            ],
            [
                'action pill colour',
                `${TABLE} [data-audit] [role=cell] >> nth=2 >> span`,
                'color',
                '#2f3a56',
            ],
            [
                'action pill size',
                `${TABLE} [data-audit] [role=cell] >> nth=2 >> span`,
                'fontSize',
                '13.5',
            ],
            [
                'action pill padding',
                `${TABLE} [data-audit] [role=cell] >> nth=2 >> span`,
                'paddingTop',
                '5',
            ],
            [
                'details size',
                `${TABLE} [data-audit] [role=cell] >> nth=3`,
                'fontSize',
                '14.5',
            ],
            [
                'details colour',
                `${TABLE} [data-audit] [role=cell] >> nth=3`,
                'color',
                '#3f4b66',
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

        console.log(
            `\n== ${spec.name} (${off} differences)\n${rows.join('\n')}`,
        );
        expect(rows.length).toBeGreaterThan(0);
    });
}
