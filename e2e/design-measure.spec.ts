import { expect, test } from '@playwright/test';

// Compares computed styles on the live pages against values read from the design files
// (Login, Register, Invite, Privacy, Main). Run on demand: it prints a table of differences.
test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

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

const PAGES: { name: string; path: string; checks: Check[] }[] = [
    {
        name: 'login',
        path: '/login',
        checks: [
            ['page background', 'div.min-h-dvh', 'backgroundColor', '#f9fafb'],
            [
                'card width',
                '#auth-title >> xpath=ancestor::section',
                'width',
                '440',
            ],
            [
                'card padding',
                '#auth-title >> xpath=ancestor::section',
                'paddingTop',
                '32',
            ],
            [
                'card radius',
                '#auth-title >> xpath=ancestor::section',
                'borderTopLeftRadius',
                '16',
            ],
            [
                'card border',
                '#auth-title >> xpath=ancestor::section',
                'borderTopColor',
                '#e4e7ee',
            ],
            ['title size', '#auth-title', 'fontSize', '26'],
            ['title weight', '#auth-title', 'fontWeight', '700'],
            ['title colour', '#auth-title', 'color', '#071437'],
            ['lead size', '#auth-title + p', 'fontSize', '15'],
            ['lead colour', '#auth-title + p', 'color', '#4b5675'],
            ['label size', 'label[for]', 'fontSize', '14'],
            ['label weight', 'label[for]', 'fontWeight', '600'],
            ['input height', 'input[type=email]', 'height', '48'],
            ['input radius', 'input[type=email]', 'borderTopLeftRadius', '10'],
            ['input border', 'input[type=email]', 'borderTopColor', '#d5d9e3'],
            ['input font size', 'input[type=email]', 'fontSize', '16'],
            ['input text colour', 'input[type=email]', 'color', '#071437'],
            ['sign-in height', 'button[type=submit]', 'height', '52'],
            [
                'sign-in colour',
                'button[type=submit]',
                'backgroundColor',
                '#1366d6',
            ],
            [
                'sign-in radius',
                'button[type=submit]',
                'borderTopLeftRadius',
                '10',
            ],
            ['sign-in font', 'button[type=submit]', 'fontSize', '16'],
        ],
    },
    {
        name: 'register',
        path: '/register',
        checks: [
            [
                'card width',
                '#auth-title >> xpath=ancestor::section',
                'width',
                '560',
            ],
            ['title size', '#auth-title', 'fontSize', '26'],
            ['checkbox size', '[role=checkbox]', 'width', '22'],
            ['create height', 'button[type=submit]', 'height', '52'],
        ],
    },
    {
        name: 'invite',
        path: '/invite/sample-receptionist',
        checks: [
            [
                'card width',
                '#auth-title >> xpath=ancestor::section',
                'width',
                '460',
            ],
            ['summary radius', 'dl', 'borderTopLeftRadius', '12'],
            ['summary background', 'dl', 'backgroundColor', '#f9fafb'],
            ['role pill background', 'dd span', 'backgroundColor', '#ddebfe'],
            ['role pill colour', 'dd span', 'color', '#0b4491'],
        ],
    },
    {
        name: 'privacy',
        path: '/privacy',
        checks: [
            ['title size (42 at 1440)', 'h1', 'fontSize', '42'],
            ['title weight', 'h1', 'fontWeight', '700'],
            ['section title size', 'article h2', 'fontSize', '24'],
            ['section title weight', 'article h2', 'fontWeight', '700'],
            ['body size', 'article p', 'fontSize', '16'],
            [
                'list column width',
                'nav[aria-label="On this page"]',
                'width',
                '260',
            ],
            ['article max width', 'article', 'maxWidth', '760px'],
            [
                'switch button height',
                '[role=group] button >> nth=0',
                'height',
                '44',
            ],
        ],
    },
    {
        name: 'landing',
        path: '/',
        checks: [
            ['h1 size (56 at 1440)', 'h1', 'fontSize', '56'],
            ['h1 weight', 'h1', 'fontWeight', '700'],
            ['h1 colour', 'h1', 'color', '#071437'],
            [
                'hero background',
                'main > section >> nth=0',
                'backgroundColor',
                '#f9fafb',
            ],
            ['hero lead size', 'h1 + p', 'fontSize', '19'],
            [
                'section title size (38 at 1440)',
                '#benefits h2',
                'fontSize',
                '38',
            ],
            [
                'benefit card radius',
                '#benefits h3 >> xpath=..',
                'borderTopLeftRadius',
                '14',
            ],
            [
                'benefit card padding',
                '#benefits h3 >> xpath=..',
                'paddingTop',
                '28',
            ],
            ['benefit title size', '#benefits h3', 'fontSize', '21'],
            ['faq question size', '#faq h3 button', 'fontSize', '18'],
            ['faq question min height', '#faq h3 button', 'height', '64'],
            [
                'closing band colour',
                '#cta h2 >> xpath=..',
                'backgroundColor',
                '#0b2a5b',
            ],
            [
                'closing band radius',
                '#cta h2 >> xpath=..',
                'borderTopLeftRadius',
                '20',
            ],
            ['header height', 'header >> nth=0', 'height', '73'],
        ],
    },
];

for (const page of PAGES) {
    test(`design values: ${page.name}`, async ({ page: p, baseURL }) => {
        await p
            .context()
            .addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
        await p.goto(page.path, { waitUntil: 'domcontentloaded' });
        await p.getByRole('heading', { level: 1 }).waitFor();
        await p.evaluate(() => document.fonts.ready);

        const rows: string[] = [];
        let off = 0;

        for (const [label, selector, prop, expected] of page.checks) {
            const loc = p.locator(selector.replace(' >> nth=0', '')).first();
            const actual = await loc
                .evaluate(
                    (el, property) =>
                        getComputedStyle(el)[property as never] as string,
                    prop,
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
            `\n== ${page.name} (${off} differences)\n${rows.join('\n')}`,
        );
        expect(rows.length).toBeGreaterThan(0);
    });
}
