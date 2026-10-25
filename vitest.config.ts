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
        // jsdom start-up is slow on busy machines; keep the worker count modest.
        maxWorkers: 4,
        testTimeout: 20_000,
    },
});
