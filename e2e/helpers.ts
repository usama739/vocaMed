import { expect, type Page } from '@playwright/test';

export type Locale = 'en' | 'ur';

/** Open a page in a language: the server reads the `locale` cookie, so first paint is already right. */
export async function gotoIn(page: Page, path: string, locale: Locale) {
    await page
        .context()
        .addCookies([
            {
                name: 'locale',
                value: locale,
                url: new URL(
                    page.url() === 'about:blank'
                        ? 'http://127.0.0.1'
                        : page.url(),
                ).origin,
            },
        ])
        .catch(() => undefined);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ur' ? 'rtl' : 'ltr',
    );
}

export async function setLocaleCookie(
    page: Page,
    baseURL: string,
    locale: Locale,
) {
    await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: baseURL }]);
}

/** Interactive elements smaller than 44px in either direction (checkbox boxes are judged by their label). */
export async function smallTargets(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const selector =
            'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=checkbox], [role=combobox]';
        const bad: string[] = [];

        document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
            const r = el.getBoundingClientRect();

            if (
                r.width === 0 ||
                r.height === 0 ||
                getComputedStyle(el).visibility === 'hidden' ||
                el.closest(
                    '.sr-only, [hidden], [inert], [aria-hidden="true"]',
                ) ||
                el.matches('.sr-only') ||
                el.matches('a[href="#main-content"]')
            ) {
                return;
            }

            const label = el.closest('label');
            const box = label ? label.getBoundingClientRect() : r;

            if (box.height < 43.5 || box.width < 43.5) {
                const name = (
                    el.getAttribute('aria-label') ||
                    el.textContent ||
                    ''
                )
                    .trim()
                    .slice(0, 30);

                bad.push(
                    `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
                );
            }
        });

        return bad;
    });
}

export const sidewaysOverflow = (page: Page) =>
    page.evaluate(
        () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
    );

/** Collects uncaught errors and React warnings so a test can assert the page ran clean. */
export function watchConsole(page: Page) {
    const problems: string[] = [];

    page.on('pageerror', (error) =>
        problems.push(`pageerror: ${error.message}`),
    );
    page.on('console', (message) => {
        if (message.type() === 'error' || /warning/i.test(message.text())) {
            problems.push(`${message.type()}: ${message.text().slice(0, 200)}`);
        }
    });

    return problems;
}
