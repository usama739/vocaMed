import { expect, test } from '@playwright/test';

const EN = '[lang="en"][dir="ltr"]';
const UR = '[lang="ur"][dir="rtl"]';

// The preview page is only registered in local and testing environments.
test.describe('/components preview', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/components', { waitUntil: 'domcontentloaded' });
        await expect(
            page.getByRole('heading', {
                name: 'VocaMed components',
                level: 1,
            }),
        ).toBeVisible();
    });

    test('shows every component in English and in Urdu right-to-left', async ({
        page,
    }) => {
        expect(await page.locator(UR).count()).toBeGreaterThan(20);
        expect(await page.locator(EN).count()).toBeGreaterThan(20);

        for (const id of [
            'tokens',
            'status-badge',
            'voice-capture',
            'app-shell',
            'booking-panel',
            'confirm-dialog',
            'toast',
            'states',
            'form-fields',
            'table',
        ]) {
            await expect(page.locator(`#${id}`)).toBeAttached();
        }
    });

    test('no translation key is left showing and nothing overflows the page sideways', async ({
        page,
    }) => {
        await expect(
            page.getByText('Check before booking').first(),
        ).toBeVisible();
        const text = await page.locator('body').innerText();

        expect(text).not.toMatch(
            /\b(shell|nav|booking|voice|states|table|form|status|common)\.[a-zA-Z_]+/,
        );

        const overflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test('every button, link and field is at least 44px', async ({ page }) => {
        // Let the booking panels finish loading their sample data first.
        await expect(
            page.getByText('Check before booking').first(),
        ).toBeVisible();

        const tooSmall = await page.evaluate(() => {
            const selector =
                'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=checkbox]';
            const bad: string[] = [];

            document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
                const r = el.getBoundingClientRect();

                if (
                    r.width === 0 ||
                    r.height === 0 ||
                    getComputedStyle(el).visibility === 'hidden' ||
                    el.closest('.sr-only, [hidden]')
                ) {
                    return;
                }

                // A checkbox's 22px box is the visual; its 44px label is the tap target.
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

        expect(tooSmall).toEqual([]);
    });

    test('keyboard focus shows a 3px brand ring on buttons, links and inputs', async ({
        page,
    }) => {
        for (const selector of [
            '#tokens button',
            '#tokens a[href="#tokens"]',
            '#tokens input',
        ]) {
            const target = page.locator(selector).first();
            await target.scrollIntoViewIfNeeded();

            // Tab until the target has focus, as a keyboard user would.
            for (let i = 0; i < 200; i++) {
                await page.keyboard.press('Tab');

                if (
                    await target.evaluate((el) => el === document.activeElement)
                ) {
                    break;
                }
            }

            await expect
                .poll(() =>
                    target.evaluate((el) => {
                        const s = getComputedStyle(el);

                        return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} ${s.outlineOffset}`;
                    }),
                )
                .toBe('3px solid rgb(19, 102, 214) 2px');
            expect(
                await target.evaluate((el) => getComputedStyle(el).boxShadow),
            ).toBe('none');
        }
    });

    test.describe('desktop layout', () => {
        test.beforeEach(({ viewport }) => {
            test.skip(
                (viewport?.width ?? 0) < 1024,
                'The sidebar is a drawer below 1024px; see the tablet test.',
            );
        });

        test('receptionist sees exactly five nav items and a New booking button, in both languages', async ({
            page,
        }) => {
            for (const [scope, menu, newBooking] of [
                [EN, 'Main menu', /New booking/],
                [UR, 'مرکزی مینو', /نئی بکنگ/],
            ] as const) {
                const frame = page
                    .locator(`#app-shell ${scope}`)
                    .filter({
                        has: page.getByRole('navigation', { name: menu }),
                    })
                    .first();

                // One brand link at the top, then the five items.
                await expect(
                    frame
                        .getByRole('navigation', { name: menu })
                        .getByRole('link'),
                ).toHaveCount(6);
                await expect(
                    frame.getByRole('button', { name: newBooking }),
                ).toBeVisible();
            }
        });

        test('the sidebar sits on the left in English and on the right in Urdu', async ({
            page,
        }) => {
            const sideOf = (scope: string) =>
                page.evaluate((selector) => {
                    const frame = document.querySelector(
                        `#app-shell ${selector}`,
                    )!;
                    const nav = frame
                        .querySelector('nav[aria-label]')!
                        .getBoundingClientRect();
                    const box = frame.getBoundingClientRect();

                    return nav.left - box.left < box.right - nav.right
                        ? 'left'
                        : 'right';
                }, scope);

            expect(await sideOf(EN)).toBe('left');
            expect(await sideOf(UR)).toBe('right');
        });
    });

    test('opening the booking slide-over in Urdu mirrors it and Escape closes it', async ({
        page,
    }) => {
        await page
            .getByRole('button', { name: 'Open slide-over (Urdu)' })
            .click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('dir', 'rtl');
        await expect(
            dialog.getByRole('heading', { name: 'نئی بکنگ' }),
        ).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('the confirm dialog keeps focus on the safe choice and Escape cancels', async ({
        page,
    }) => {
        await page
            .getByRole('button', { name: 'Open dialog (English)' })
            .click();

        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByRole('button', { name: 'Keep appointment' }),
        ).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });

    test('a toast appears with a dismiss button, in Urdu too', async ({
        page,
    }) => {
        await page.getByRole('button', { name: 'Fire success (Urdu)' }).click();

        // The live toaster, not the static copy on the page.
        const toast = page
            .locator('[data-sonner-toaster]')
            .getByRole('status')
            .filter({ hasText: 'اپائنٹمنٹ منسوخ ہو گئی۔' });

        await expect(toast).toBeVisible();
        await expect(toast).toHaveAttribute('class', /success/);
        await toast.getByRole('button', { name: 'ہٹائیں' }).click();
        await expect(toast).toBeHidden();
    });

    test('the table filters in both languages', async ({ page }) => {
        const table = page.locator('#table');

        const english = table.locator(EN).first();
        await english.getByRole('searchbox').first().fill('Omar');
        await expect(english.getByRole('status').first()).toHaveText('1 row');

        const urdu = table.locator(UR).first();
        await urdu.getByRole('searchbox').first().fill('عمر');
        await expect(urdu.getByRole('status').first()).toHaveText('1 قطار');
    });

    test('works at tablet width without sideways scrolling and opens the menu drawer', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 820, height: 1180 });
        await page.goto('/components', { waitUntil: 'domcontentloaded' });

        await expect(
            page.getByText('Check before booking').first(),
        ).toBeVisible();
        const overflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        const frame = page.locator(`#app-shell ${EN}`).first();
        await frame.getByRole('button', { name: 'Open menu' }).first().click();

        const drawer = page.getByRole('dialog');
        await expect(drawer.getByRole('navigation')).toBeVisible();
        await expect(
            drawer.getByRole('link', { name: 'Appointments' }),
        ).toBeVisible();
    });
});
