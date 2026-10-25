import { defineConfig, devices } from '@playwright/test';

const port = 8000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: 'e2e',
    outputDir: 'storage/app/playwright',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        // Receptionists also work on tablets.
        {
            name: 'tablet',
            use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
        },
    ],
    webServer: {
        // Serves the production build in public/build; run `pnpm build` first.
        command: `php artisan serve --host=127.0.0.1 --port=${port}`,
        url: `${baseURL}/up`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
