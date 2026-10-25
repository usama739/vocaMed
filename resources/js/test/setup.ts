import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Findings wait on async data and on busy machines; the default 1s is too tight.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
    cleanup();
});
