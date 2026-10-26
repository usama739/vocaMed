import { expect, test } from '@playwright/test';

// Compares computed styles on the Staff, Services and Clinic settings pages with values read from
// the design files (Staff, Services, Settings). Run on demand: it prints a table of differences
// instead of failing, so the list can go in the review.
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

const TABLE = '[role=table]';

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'staff',
        path: '/admin/staff',
        ready: '[data-staff]',
        checks: [
            ...H1,
            [
                'invite height',
                'main button:has-text("Invite staff")',
                'height',
                '48',
            ],
            [
                'invite background',
                'main button:has-text("Invite staff")',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'invite size',
                'main button:has-text("Invite staff")',
                'fontSize',
                '15',
            ],
            [
                'invite weight',
                'main button:has-text("Invite staff")',
                'fontWeight',
                '600',
            ],
            [
                'table container radius',
                `div:has(> ${TABLE})`,
                'borderTopLeftRadius',
                '14',
            ],
            [
                'table container border',
                `div:has(> ${TABLE})`,
                'borderTopColor',
                '#e4e7ee',
            ],
            [
                'header background',
                `${TABLE} [role=row] >> nth=0`,
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'header padding',
                `${TABLE} [role=row] >> nth=0`,
                'paddingTop',
                '12',
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
            ['row min height', '[data-staff] >> nth=0', 'minHeight', '72px'],
            ['row padding', '[data-staff] >> nth=0', 'paddingTop', '10'],
            ['row side padding', '[data-staff] >> nth=0', 'paddingLeft', '20'],
            [
                'avatar size',
                '[data-staff] >> nth=0 >> span[aria-hidden=true]',
                'width',
                '40',
            ],
            [
                'avatar background',
                '[data-staff] >> nth=0 >> span[aria-hidden=true]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'avatar colour',
                '[data-staff] >> nth=0 >> span[aria-hidden=true]',
                'color',
                '#0b4491',
            ],
            [
                'avatar weight',
                '[data-staff] >> nth=0 >> span[aria-hidden=true]',
                'fontWeight',
                '700',
            ],
            [
                'name size',
                '[data-staff] >> nth=0 >> [role=cell] span.font-semibold',
                'fontSize',
                '15',
            ],
            [
                'name colour',
                '[data-staff] >> nth=0 >> [role=cell] span.font-semibold',
                'color',
                '#071437',
            ],
            [
                'email size',
                '[data-staff] >> nth=0 >> span[dir=ltr]',
                'fontSize',
                '13.5',
            ],
            [
                'pill size',
                '[data-staff] >> nth=0 >> [role=cell] >> nth=2 >> span',
                'fontSize',
                '13.5',
            ],
            [
                'pill background',
                '[data-staff] >> nth=0 >> [role=cell] >> nth=2 >> span',
                'backgroundColor',
                '#dff3e4',
            ],
            [
                'pill colour',
                '[data-staff] >> nth=0 >> [role=cell] >> nth=2 >> span',
                'color',
                '#14532d',
            ],
            [
                'pill padding',
                '[data-staff] >> nth=0 >> [role=cell] >> nth=2 >> span',
                'paddingTop',
                '5',
            ],
            ['action height', '[data-staff="u_recep"] button', 'height', '44'],
            ['action size', '[data-staff="u_recep"] button', 'fontSize', '14'],
            [
                'action border',
                '[data-staff="u_recep"] button',
                'borderTopColor',
                '#d5d9e3',
            ],
            [
                'deactivate colour',
                '[data-staff="u_recep"] button',
                'color',
                '#9b1239',
            ],
            [
                'resend height',
                '[data-staff="inv_1"] button >> nth=0',
                'height',
                '44',
            ],
        ],
    },
    {
        name: 'services',
        path: '/admin/services',
        ready: '[data-service]',
        checks: [
            ...H1,
            [
                'add height',
                'main button:has-text("Add service")',
                'height',
                '48',
            ],
            [
                'add background',
                'main button:has-text("Add service")',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'table container radius',
                `div:has(> ${TABLE})`,
                'borderTopLeftRadius',
                '14',
            ],
            [
                'header background',
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
            ['row min height', '[data-service] >> nth=0', 'minHeight', '72px'],
            ['row padding', '[data-service] >> nth=0', 'paddingTop', '10'],
            [
                'name size',
                '[data-service] >> nth=0 >> [role=cell] >> nth=0',
                'fontSize',
                '15',
            ],
            [
                'name weight',
                '[data-service] >> nth=0 >> [role=cell] >> nth=0',
                'fontWeight',
                '600',
            ],
            [
                'switch hit height',
                '[data-service] >> nth=0 >> [role=switch]',
                'height',
                '44',
            ],
            [
                'switch track width',
                '[data-service] >> nth=0 >> [role=switch] > span',
                'width',
                '44',
            ],
            [
                'switch track height',
                '[data-service] >> nth=0 >> [role=switch] > span',
                'height',
                '26',
            ],
            [
                'switch on colour',
                '[data-service] >> nth=0 >> [role=switch] > span',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'state label size',
                '[data-service] >> nth=0 >> [role=cell] >> nth=4 >> span.font-semibold',
                'fontSize',
                '13.5',
            ],
            [
                'edit height',
                '[data-service] >> nth=0 >> button >> nth=1',
                'height',
                '44',
            ],
            [
                'edit size',
                '[data-service] >> nth=0 >> button >> nth=1',
                'fontSize',
                '14',
            ],
        ],
    },
    {
        name: 'settings',
        path: '/admin/settings',
        ready: '#clinic-details',
        checks: [
            ...H1,
            ['content max width', 'main > div > div', 'maxWidth', '960px'],
            [
                'card radius',
                'section[aria-labelledby="clinic-details"]',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'card padding',
                'section[aria-labelledby="clinic-details"]',
                'paddingTop',
                '24',
            ],
            [
                'card border',
                'section[aria-labelledby="clinic-details"]',
                'borderTopColor',
                '#e4e7ee',
            ],
            ['card title size', '#clinic-details', 'fontSize', '18'],
            ['card title colour', '#clinic-details', 'color', '#071437'],
            ['label size', 'label[for] >> nth=0', 'fontSize', '14'],
            ['label weight', 'label[for] >> nth=0', 'fontWeight', '600'],
            [
                'input height',
                'section[aria-labelledby="clinic-details"] input >> nth=0',
                'height',
                '48',
            ],
            [
                'input radius',
                'section[aria-labelledby="clinic-details"] input >> nth=0',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'input size',
                'section[aria-labelledby="clinic-details"] input >> nth=0',
                'fontSize',
                '16',
            ],
            [
                'input border',
                'section[aria-labelledby="clinic-details"] input >> nth=0',
                'borderTopColor',
                '#d5d9e3',
            ],
            [
                'select height',
                'section[aria-labelledby="clinic-details"] select',
                'height',
                '48',
            ],
            [
                'select radius',
                'section[aria-labelledby="clinic-details"] select',
                'borderTopLeftRadius',
                '10',
            ],
            ['hours row min height', '[data-weekday="1"]', 'minHeight', '60px'],
            ['hours row padding', '[data-weekday="1"]', 'paddingTop', '8'],
            [
                'hours row divider',
                '[data-weekday="1"]',
                'borderBottomColor',
                '#eef0f5',
            ],
            ['day name size', '[data-weekday="1"] > span', 'fontSize', '15'],
            [
                'day switch hit height',
                '[data-weekday="1"] [role=switch]',
                'height',
                '44',
            ],
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
                '[data-weekday="1"] [role=group] span >> nth=0',
                'fontSize',
                '15',
            ],
            [
                'stepper value width',
                '[data-weekday="1"] [role=group] span >> nth=0',
                'minWidth',
                '92px',
            ],
            [
                'reminder chip height',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'minHeight',
                '44px',
            ],
            [
                'reminder chip background',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'reminder chip border',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'borderTopColor',
                '#c9d6ee',
            ],
            [
                'reminder chip colour',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'color',
                '#0b4491',
            ],
            [
                'reminder chip size',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'fontSize',
                '15',
            ],
            [
                'reminder chip radius',
                'section[aria-labelledby="reminders"] li >> nth=0',
                'borderTopLeftRadius',
                '999',
            ],
            [
                'voice switch hit height',
                'section[aria-labelledby="voice-booking"] [role=switch]',
                'height',
                '44',
            ],
            [
                'retention select height',
                'section[aria-labelledby="voice-booking"] select',
                'height',
                '48',
            ],
            [
                'save height',
                'main button:has-text("Save settings")',
                'height',
                '48',
            ],
            [
                'save background',
                'main button:has-text("Save settings")',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'discard height',
                'main button:has-text("Discard changes")',
                'height',
                '48',
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
