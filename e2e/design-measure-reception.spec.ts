import { expect, test } from '@playwright/test';

// Compares computed styles on the receptionist pages with values read from the design files
// (Today, Appointments, Appointment, Calendar, Patients, Patient, Notifications). Run on demand:
// it prints a table of differences instead of failing, so the list can go in the review.
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

const CARD = (label: string, selector: string): Check[] => [
    [`${label} radius`, selector, 'borderTopLeftRadius', '14'],
    [`${label} border`, selector, 'borderTopColor', '#e4e7ee'],
];

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'today',
        path: '/reception',
        ready: 'main section li',
        checks: [
            ...H1,
            ['lead size', 'h1 + p', 'fontSize', '15'],
            ['lead colour', 'h1 + p', 'color', '#4b5675'],
            ...CARD('summary card', '[aria-label="Today’s summary"] > div'),
            [
                'summary card padding',
                '[aria-label="Today’s summary"] > div',
                'paddingTop',
                '14',
            ],
            [
                'summary number size',
                '[aria-label="Today’s summary"] > div > span:first-child',
                'fontSize',
                '28',
            ],
            [
                'summary number weight',
                '[aria-label="Today’s summary"] > div > span:first-child',
                'fontWeight',
                '700',
            ],
            [
                'summary label size',
                '[aria-label="Today’s summary"] > div > span:last-child',
                'fontSize',
                '14',
            ],
            [
                'summary label colour',
                '[aria-label="Today’s summary"] > div > span:last-child',
                'color',
                '#4b5675',
            ],
            ...CARD('walk-in form', 'main form'),
            ['walk-in form padding', 'main form', 'paddingTop', '16'],
            [
                'walk-in form background',
                'main form',
                'backgroundColor',
                '#f9fafb',
            ],
            ['walk-in input height', 'main form input', 'height', '48'],
            [
                'walk-in input radius',
                'main form input',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'walk-in input border',
                'main form input',
                'borderTopColor',
                '#d5d9e3',
            ],
            ...CARD('doctor group', 'main section'),
            [
                'group header background',
                'main section > div:first-child',
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'group header padding',
                'main section > div:first-child',
                'paddingTop',
                '14',
            ],
            [
                'group avatar size',
                'main section > div:first-child span[aria-hidden]',
                'width',
                '40',
            ],
            [
                'group avatar background',
                'main section > div:first-child span[aria-hidden]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'group avatar colour',
                'main section > div:first-child span[aria-hidden]',
                'color',
                '#0b4491',
            ],
            ['doctor name size', 'main section strong', 'fontSize', '16'],
            ['row min height', 'main section li', 'height', '72'],
            ['row padding', 'main section li', 'paddingTop', '10'],
            ['row divider', 'main section li', 'borderBottomColor', '#eef0f5'],
            [
                'time size',
                'main section li > span:first-child',
                'fontSize',
                '16',
            ],
            [
                'time weight',
                'main section li > span:first-child',
                'fontWeight',
                '700',
            ],
            [
                'patient name size',
                'main section li a span:first-child',
                'fontSize',
                '15',
            ],
            [
                'patient name weight',
                'main section li a span:first-child',
                'fontWeight',
                '600',
            ],
            [
                'service size',
                'main section li a span:last-child',
                'fontSize',
                '13.5',
            ],
            ['stage button height', 'main section li button', 'height', '44'],
            [
                'stage button radius',
                'main section li button',
                'borderTopLeftRadius',
                '10',
            ],
            ['stage button size', 'main section li button', 'fontSize', '14'],
            [
                'stage button weight',
                'main section li button',
                'fontWeight',
                '600',
            ],
            [
                'stage button padding',
                'main section li button',
                'paddingLeft',
                '12',
            ],
            [
                'stage button border',
                'main section li button[aria-pressed="false"]',
                'borderTopColor',
                '#d5d9e3',
            ],
            [
                'stage button colour',
                'main section li button[aria-pressed="false"]',
                'color',
                '#2f3a56',
            ],
            [
                'active stage border',
                'main section li button[aria-pressed="true"]',
                'borderTopColor',
                '#1366d6',
            ],
            [
                'active stage background',
                'main section li button[aria-pressed="true"]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'active stage colour',
                'main section li button[aria-pressed="true"]',
                'color',
                '#0b4491',
            ],
        ],
    },
    {
        name: 'appointments',
        path: '/reception/appointments',
        ready: 'main table tbody tr',
        checks: [
            ...H1,
            ['lead size', 'h1 + p', 'fontSize', '15'],
            [
                'filter bar padding',
                'main div.bg-surface-subtle',
                'paddingTop',
                '18',
            ],
            [
                'filter bar radius',
                'main div.bg-surface-subtle',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'filter bar background',
                'main div.bg-surface-subtle',
                'backgroundColor',
                '#f9fafb',
            ],
            ['search height', 'main input[type=search]', 'height', '48'],
            [
                'search radius',
                'main input[type=search]',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'chip height',
                '[role=group] button[aria-pressed]',
                'height',
                '44',
            ],
            [
                'chip radius',
                '[role=group] button[aria-pressed]',
                'borderTopLeftRadius',
                '9999',
            ],
            [
                'chip size',
                '[role=group] button[aria-pressed]',
                'fontSize',
                '15',
            ],
            [
                'chip weight',
                '[role=group] button[aria-pressed]',
                'fontWeight',
                '600',
            ],
            [
                'active chip border',
                '[role=group] button[aria-pressed="true"]',
                'borderTopColor',
                '#1366d6',
            ],
            [
                'active chip background',
                '[role=group] button[aria-pressed="true"]',
                'backgroundColor',
                '#eaf2fe',
            ],
            ['count size', 'main span[role=status]', 'fontSize', '15'],
            ['count weight', 'main span[role=status]', 'fontWeight', '600'],
            ['table radius', 'main table', 'borderTopLeftRadius', '14'],
            [
                'table header background',
                'main thead tr',
                'backgroundColor',
                '#f9fafb',
            ],
            ['table header size', 'main thead th', 'fontSize', '13'],
            ['table header colour', 'main thead th', 'color', '#5b6781'],
            ['row height', 'main tbody tr', 'height', '72'],
            ['row divider', 'main tbody tr', 'borderBottomColor', '#eef0f5'],
            [
                'row action height',
                'main tbody tr a[href^="/reception/appointments/"]',
                'height',
                '44',
            ],
            [
                'row action padding',
                'main tbody tr a[href^="/reception/appointments/"]',
                'paddingLeft',
                '14',
            ],
            [
                'row action size',
                'main tbody tr a[href^="/reception/appointments/"]',
                'fontSize',
                '14',
            ],
            [
                'pagination button height',
                'nav[aria-label="Pages"] button',
                'height',
                '48',
            ],
            [
                'pagination button padding',
                'nav[aria-label="Pages"] button',
                'paddingLeft',
                '18',
            ],
        ],
    },
    {
        name: 'appointment',
        path: '/reception/appointments/a_004',
        ready: 'dl',
        checks: [
            ...H1,
            ...CARD('details card', 'main section >> nth=0'),
            [
                'details card padding',
                'main section >> nth=0',
                'paddingTop',
                '20',
            ],
            ['card heading size', 'main section h2 >> nth=0', 'fontSize', '18'],
            ['fact label colour', 'dt >> nth=0', 'color', '#5b6781'],
            ['fact value weight', 'dd >> nth=0', 'fontWeight', '600'],
            ['fact value colour', 'dd >> nth=0', 'color', '#071437'],
            [
                'primary action height',
                'main button:has-text("Mark arrived")',
                'height',
                '48',
            ],
            [
                'primary action colour',
                'main button:has-text("Mark arrived")',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'cancel action colour',
                'main button:has-text("Cancel appointment")',
                'color',
                '#9b1239',
            ],
            [
                'timeline dot size',
                'main ol li span[aria-hidden] >> nth=2',
                'width',
                '10',
            ],
        ],
    },
    {
        name: 'calendar',
        path: '/reception/calendar?date=2026-10-26',
        ready: 'main [role=table] [role=row]',
        checks: [
            ...H1,
            [
                'view switch padding',
                '[aria-label="Calendar view"]',
                'paddingTop',
                '3',
            ],
            [
                'view switch radius',
                '[aria-label="Calendar view"]',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'view tab height',
                '[aria-label="Calendar view"] button',
                'height',
                '44',
            ],
            [
                'view tab min width',
                '[aria-label="Calendar view"] button',
                'minWidth',
                '76px',
            ],
            [
                'view tab size',
                '[aria-label="Calendar view"] button',
                'fontSize',
                '14.5',
            ],
            [
                'active view background',
                '[aria-label="Calendar view"] button[aria-pressed="true"]',
                'backgroundColor',
                '#eaf2fe',
            ],
            [
                'legend chip size',
                'ul[aria-label="Status key"] li',
                'fontSize',
                '12.5',
            ],
            [
                'legend chip padding',
                'ul[aria-label="Status key"] li',
                'paddingLeft',
                '10',
            ],
            ['grid radius', 'main [role=table]', 'borderTopLeftRadius', '14'],
            [
                'grid header background',
                'main [role=table] [role=row] >> nth=0',
                'backgroundColor',
                '#f9fafb',
            ],
            [
                'time column width',
                'main [role=table] [role=row] >> nth=1',
                'gridTemplateColumns',
                '72px',
            ],
            [
                'row min height',
                'main [role=table] [role=row] >> nth=1',
                'minHeight',
                '84px',
            ],
            [
                'event radius',
                'main [role=table] button[aria-pressed] >> nth=0',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'event padding',
                'main [role=table] button[aria-pressed] >> nth=0',
                'paddingTop',
                '10',
            ],
            [
                'event border',
                'main [role=table] button[aria-pressed] >> nth=0',
                'borderTopWidth',
                '2',
            ],
            [
                'free slot border style',
                'main [role=table] button[aria-label^="Book"] >> nth=0',
                'borderTopStyle',
                'dashed',
            ],
            [
                'free slot min height',
                'main [role=table] button[aria-label^="Book"] >> nth=0',
                'minHeight',
                '64px',
            ],
        ],
    },
    {
        name: 'patients',
        path: '/reception/patients',
        ready: 'main table tbody tr',
        checks: [
            ...H1,
            ['search height', '#patient-search', 'height', '58'],
            ['search border width', '#patient-search', 'borderTopWidth', '2'],
            ['search radius', '#patient-search', 'borderTopLeftRadius', '12'],
            ['search size', '#patient-search', 'fontSize', '18'],
            ['list title size', 'main h2', 'fontSize', '16'],
            ['table radius', 'main table', 'borderTopLeftRadius', '14'],
            ['row height', 'main tbody tr', 'height', '68'],
            ['avatar size', 'main tbody tr span[aria-hidden]', 'width', '40'],
            [
                'avatar background',
                'main tbody tr span[aria-hidden]',
                'backgroundColor',
                '#eaf2fe',
            ],
            ['open button height', 'main tbody tr a', 'height', '44'],
        ],
    },
    {
        name: 'patient',
        path: '/reception/patients/p_4',
        ready: 'main section',
        checks: [
            ...H1,
            ['avatar size', 'main span[aria-hidden] >> nth=0', 'width', '64'],
            [
                'avatar text',
                'main span[aria-hidden] >> nth=0',
                'fontSize',
                '22',
            ],
            ...CARD('contact card', 'main section >> nth=0'),
            [
                'contact card padding',
                'main section >> nth=0',
                'paddingTop',
                '20',
            ],
            [
                'phone input height',
                '#phone, main input[type=tel]',
                'height',
                '48',
            ],
            [
                'language chip height',
                '[aria-label="Message language"] button',
                'height',
                '48',
            ],
            [
                'language chip radius',
                '[aria-label="Message language"] button',
                'borderTopLeftRadius',
                '10',
            ],
            [
                'notes help size',
                'main p:has-text("Do not record")',
                'fontSize',
                '13',
            ],
            [
                'stat number size',
                'main div.grid-cols-3 > div > span:first-child',
                'fontSize',
                '24',
            ],
            [
                'stat card radius',
                'main div.grid-cols-3 > div',
                'borderTopLeftRadius',
                '12',
            ],
            [
                'save button height',
                'main button:has-text("Save changes")',
                'height',
                '48',
            ],
        ],
    },
    {
        name: 'notifications',
        path: '/reception/notifications',
        ready: 'main table tbody tr',
        checks: [
            ...H1,
            ['banner padding', 'main [role=alert]', 'paddingTop', '14'],
            ['banner radius', 'main [role=alert]', 'borderTopLeftRadius', '12'],
            ['banner border', 'main [role=alert]', 'borderTopColor', '#f1a3b5'],
            [
                'banner background',
                'main [role=alert]',
                'backgroundColor',
                '#fdebef',
            ],
            ['banner colour', 'main [role=alert]', 'color', '#7a0e2e'],
            ['banner size', 'main [role=alert]', 'fontSize', '15'],
            [
                'chip height',
                '[aria-label="Filter by status"] button',
                'height',
                '44',
            ],
            [
                'chip radius',
                '[aria-label="Filter by status"] button',
                'borderTopLeftRadius',
                '9999',
            ],
            ['table radius', 'main table', 'borderTopLeftRadius', '14'],
            ['row height', 'main tbody tr', 'height', '68'],
            [
                'failure reason size',
                'main tbody tr span.text-danger-deep',
                'fontSize',
                '13',
            ],
            [
                'failure reason colour',
                'main tbody tr span.text-danger-deep',
                'color',
                '#7a0e2e',
            ],
            ['resend height', 'main tbody tr button', 'height', '44'],
        ],
    },
];

for (const spec of PAGES) {
    test(`design values: ${spec.name}`, async ({ page, baseURL }) => {
        await page
            .context()
            .addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
        await page.goto(
            `${spec.path}${spec.path.includes('?') ? '&' : '?'}now=2026-10-26T05:15:00.000Z`,
            {
                waitUntil: 'domcontentloaded',
            },
        );
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
                    Math.abs(Number(shown) - Number(want)) <= 0.6) ||
                (want === '9999' && Number(shown) > 100) ||
                (prop === 'gridTemplateColumns' && shown.startsWith(want));

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
