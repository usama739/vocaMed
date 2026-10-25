import { expect, test } from '@playwright/test';

test('renders English left-to-right by default', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('renders Urdu right-to-left from the locale cookie, on first paint', async ({
    page,
    context,
    baseURL,
}) => {
    await context.addCookies([{ name: 'locale', value: 'ur', url: baseURL! }]);
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('body')).toHaveCSS('direction', 'rtl');
});
