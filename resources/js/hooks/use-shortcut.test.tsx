import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useShortcut } from './use-shortcut';

function Harness({
    onKey,
    enabled = true,
}: {
    onKey: () => void;
    enabled?: boolean;
}) {
    useShortcut('n', onKey, enabled);

    return <input aria-label="field" />;
}

describe('useShortcut', () => {
    it('fires on the key, but not while typing in a field or with a modifier', async () => {
        const user = userEvent.setup();
        const onKey = vi.fn();
        const { getByLabelText } = render(<Harness onKey={onKey} />);

        await user.keyboard('n');
        expect(onKey).toHaveBeenCalledTimes(1);

        await user.click(getByLabelText('field'));
        await user.keyboard('n');
        expect(onKey).toHaveBeenCalledTimes(1);

        (document.activeElement as HTMLElement).blur();
        await user.keyboard('{Control>}n{/Control}');
        expect(onKey).toHaveBeenCalledTimes(1);
    });

    it('does nothing when disabled', async () => {
        const user = userEvent.setup();
        const onKey = vi.fn();
        render(<Harness onKey={onKey} enabled={false} />);

        await user.keyboard('n');

        expect(onKey).not.toHaveBeenCalled();
    });
});
