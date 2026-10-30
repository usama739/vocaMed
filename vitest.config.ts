import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, 'resources/js') },
    },
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['resources/js/test/setup.ts'],
        include: ['resources/js/**/*.test.{ts,tsx}'],
        css: false,
        // The unit tests always run on the sample data, whatever the local .env says (VITE_REAL_AUTH=true there sends the
        // sign-in, account and clinic-setup calls to Laravel). Tests of the real sources stub it themselves.
        env: { VITE_REAL_AUTH: 'false' },
        // jsdom start-up is slow on busy machines; keep the worker count modest.
        maxWorkers: 4,
        testTimeout: 20_000,
    },
});
