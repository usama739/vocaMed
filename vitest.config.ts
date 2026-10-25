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
    },
});
