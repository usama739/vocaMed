import { expect, test } from '@playwright/test';

// Compares computed styles on the doctor pages with values read from the design files (DoctorHome,
// DocSchedule, DocAvailability, DocRequests). Run on demand: it prints a table of differences
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

const NEXT = 'section[aria-labelledby="next-patient"]';
const LIST = 'section[aria-labelledby="todays-appointments"]';

const PAGES: {
    name: string;
    path: string;
    ready: string;
    checks: Check[];
}[] = [
    {
        name: 'overview',
        path: '/doctor',
        ready: `${LIST} li`,
        checks: [
            ...H1,
            ['summary card padding', '[aria-label="Today’s summary"] > div', 'paddingTop', '14'],
            ['summary card radius', '[aria-label="Today’s summary"] > div', 'borderTopLeftRadius', '14'],
            ['summary number size', '[aria-label="Today’s summary"] > div > span:first-child', 'fontSize', '28'],
            ['next card border width', NEXT, 'borderTopWidth', '2'],
            ['next card border colour', NEXT, 'borderTopColor', '#1366d6'],
            ['next card background', NEXT, 'backgroundColor', '#f3f8ff'],
            ['next card radius', NEXT, 'borderTopLeftRadius', '14'],
            ['next card padding', NEXT, 'paddingTop', '20'],
            ['next label size', '#next-patient', 'fontSize', '14'],
            ['next label weight', '#next-patient', 'fontWeight', '700'],
            ['next label colour', '#next-patient', 'color', '#0b4491'],
            ['next name size', '#next-patient + span', 'fontSize', '22'],
            ['next action height', `${NEXT} button`, 'height', '52'],
            ['list radius', LIST, 'borderTopLeftRadius', '14'],
            ['list heading size', '#todays-appointments', 'fontSize', '18'],
            ['list heading background', '#todays-appointments', 'backgroundColor', '#f9fafb'],
            ['row height', `${LIST} li`, 'height', '72'],
            ['time size', `${LIST} li > span:first-child`, 'fontSize', '16'],
            ['action height', `${LIST} li button[aria-label^="Start"]`, 'height', '44'],
            ['action size', `${LIST} li button[aria-label^="Start"]`, 'fontSize', '14'],
            ['start action border', `${LIST} li button[aria-label^="Start"]`, 'borderTopColor', '#1366d6'],
        ],
    },
    {
        name: 'schedule',
        path: '/doctor/schedule',
        ready: 'main [role=table] [role=row]',
        checks: [
            ...H1,
            ['view tab height', '[aria-label="Schedule view"] button', 'height', '44'],
            ['view tab size', '[aria-label="Schedule view"] button', 'fontSize', '14.5'],
            ['legend size', 'ul[aria-label="Status key"] li', 'fontSize', '12.5'],
            ['grid radius', 'main [role=table]', 'borderTopLeftRadius', '14'],
            ['row min height', 'main [role=table] [role=row] >> nth=1', 'minHeight', '76px'],
            ['event radius', 'main [role=table] button[aria-label*=","] >> nth=0', 'borderTopLeftRadius', '10'],
            ['event padding', 'main [role=table] button[aria-label*=","] >> nth=0', 'paddingTop', '10'],
        ],
    },
    {
        name: 'availability',
        path: '/doctor/availability',
        ready: '[data-weekday]',
        checks: [
            ...H1,
            ['weekly card radius', 'section[aria-labelledby="weekly-hours"]', 'borderTopLeftRadius', '14'],
            ['weekly heading size', '#weekly-hours', 'fontSize', '18'],
            ['weekly heading background', '#weekly-hours', 'backgroundColor', '#f9fafb'],
            ['day row min height', '[data-weekday="1"]', 'minHeight', '76px'],
            ['day row padding', '[data-weekday="1"]', 'paddingTop', '14'],
            ['switch hit height', '[role=switch] >> nth=0', 'height', '44'],
            ['switch track width', '[role=switch] > span >> nth=0', 'width', '52'],
            ['switch track height', '[role=switch] > span >> nth=0', 'height', '30'],
            ['switch on colour', '[role=switch][aria-checked="true"] > span', 'backgroundColor', '#1366d6'],
            ['switch off colour', '[role=switch][aria-checked="false"] > span', 'backgroundColor', '#aeb6c8'],
            ['day name size', '[data-weekday="1"] > span', 'fontSize', '16'],
            ['stepper height', '[data-weekday="1"] [role=group] button >> nth=0', 'height', '44'],
            ['stepper radius', '[data-weekday="1"] [role=group] button >> nth=0', 'borderTopLeftRadius', '10'],
            ['stepper value size', '[data-weekday="1"] [role=group] span[dir=ltr] >> nth=0', 'fontSize', '16'],
            ['stepper value weight', '[data-weekday="1"] [role=group] span[dir=ltr] >> nth=0', 'fontWeight', '700'],
            ['date input height', 'input[type=date] >> nth=0', 'height', '48'],
            ['date input radius', 'input[type=date] >> nth=0', 'borderTopLeftRadius', '10'],
            ['preview radius', 'aside[aria-labelledby="preview-title"]', 'borderTopLeftRadius', '14'],
            ['preview padding', 'aside[aria-labelledby="preview-title"]', 'paddingTop', '20'],
            ['preview position', 'aside[aria-labelledby="preview-title"]', 'position', 'sticky'],
            ['bar height', 'aside[aria-labelledby="preview-title"] span[aria-hidden="true"] >> nth=0', 'height', '12'],
            ['total size', 'aside[aria-labelledby="preview-title"] [role=status] span:first-child', 'fontSize', '28'],
            ['save height', 'main button:has-text("Save")', 'height', '48'],
        ],
    },
    {
        name: 'requests',
        path: '/doctor/requests',
        ready: 'article',
        checks: [
            ...H1,
            ['section title size', '#waiting-for-you', 'fontSize', '18'],
            ['card radius', 'article >> nth=0', 'borderTopLeftRadius', '14'],
            ['card padding', 'article >> nth=0', 'paddingTop', '20'],
            ['card border', 'article >> nth=0', 'borderTopColor', '#e4e7ee'],
            ['patient name size', 'article strong >> nth=0', 'fontSize', '17'],
            ['pending pill background', 'article span:has-text("Pending")', 'backgroundColor', '#fff1cc'],
            ['pending pill colour', 'article span:has-text("Pending")', 'color', '#6b4300'],
            ['message box radius', 'article textarea >> nth=0', 'borderTopLeftRadius', '10'],
            ['message box size', 'article textarea >> nth=0', 'fontSize', '16'],
            ['approve height', 'article button >> nth=0', 'height', '48'],
            ['approve colour', 'article button >> nth=0', 'backgroundColor', '#1366d6'],
            ['reject colour', 'article button >> nth=1', 'color', '#9b1239'],
            ['history radius', 'section[aria-labelledby="request-history"]', 'borderTopLeftRadius', '14'],
            ['history heading size', '#request-history', 'fontSize', '18'],
        ],
    },
];

for (const spec of PAGES) {
    test(`design values: ${spec.name}`, async ({ page, baseURL }) => {
        await page
            .context()
            .addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
        await page.goto(
            `${spec.path}?now=2026-10-26T05:15:00.000Z`,
            { waitUntil: 'domcontentloaded' },
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
