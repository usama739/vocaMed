import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 8000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: 'e2e',
    outputDir: 'storage/app/playwright',
    // PHP's built-in server handles one request at a time, so parallel workers only queue.
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    // The preview page is large; panels fill in with sample data a moment after load.
    expect: { timeout: 15_000 },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
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
