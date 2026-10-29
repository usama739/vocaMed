import { router } from '@inertiajs/react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/test/render';
import Appearance from './appearance';
import Profile from './profile';
import Security from './security';

vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    router: { visit: vi.fn() },
}));

describe('the starter kit’s settings pages', () => {
    it.each([
        ['profile', Profile],
        ['security', Security],
        ['appearance', Appearance],
    ])('%s sends a signed-in visitor to the account page', (_name, Page) => {
        vi.mocked(router.visit).mockClear();
        const { container } = render(<Page />);

        expect(router.visit).toHaveBeenCalledWith('/account', {
            replace: true,
        });
        // Nothing of their own is drawn.
        expect(container).toBeEmptyDOMElement();
    });
});
