import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderIn } from '@/test/render';
import { ConfirmDialog } from './confirm-dialog';

function Harness({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
    const [open, setOpen] = useState(true);

    return (
        <>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Cancel the appointment?"
                description="The patient will be told."
                confirmLabel="Yes, cancel it"
                cancelLabel="Keep appointment"
                onConfirm={onConfirm}
            />
            <output data-testid="state">{open ? 'open' : 'closed'}</output>
        </>
    );
}

describe('ConfirmDialog', () => {
    it('is an alert dialog and starts focus on the safe choice', async () => {
        renderIn('en', <Harness onConfirm={() => undefined} />);

        const dialog = await screen.findByRole('alertdialog');

        expect(dialog).toHaveAccessibleName('Cancel the appointment?');
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Keep appointment' }),
            ).toHaveFocus(),
        );
    });

    it('closes after an async confirm finishes', async () => {
        const user = userEvent.setup();
        const confirm = vi.fn(
            () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
        );
        renderIn('en', <Harness onConfirm={confirm} />);

        await user.click(
            await screen.findByRole('button', { name: 'Yes, cancel it' }),
        );

        expect(confirm).toHaveBeenCalledOnce();
        await waitFor(() =>
            expect(screen.getByTestId('state')).toHaveTextContent('closed'),
        );
    });

    it('Escape and Keep both cancel without confirming', async () => {
        const user = userEvent.setup();
        const confirm = vi.fn();
        renderIn('en', <Harness onConfirm={confirm} />);

        await screen.findByRole('alertdialog');
        await user.keyboard('{Escape}');

        await waitFor(() =>
            expect(screen.getByTestId('state')).toHaveTextContent('closed'),
        );
        expect(confirm).not.toHaveBeenCalled();
    });

    it('sets the dialog direction for Urdu', async () => {
        renderIn('ur', <Harness onConfirm={() => undefined} />);

        expect(await screen.findByRole('alertdialog')).toHaveAttribute(
            'dir',
            'rtl',
        );
    });
});
