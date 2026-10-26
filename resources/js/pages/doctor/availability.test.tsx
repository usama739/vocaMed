import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Availability from './availability';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    vi.mocked(notify).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async () => {
    const source = receptionSource('u_doc1').source;
    const result = renderReception(<Availability />, { source });
    await screen.findByRole('switch', { name: 'Monday' });

    return { ...result, source };
};

const preview = () => screen.getByRole('complementary');
const day = (name: string) =>
    screen
        .getByRole('switch', { name })
        .closest('[data-weekday]') as HTMLElement;

describe('Availability', () => {
    it('shows the saved weekly hours, a lunch break, time off and the preview', async () => {
        await open();

        expect(screen.getByRole('switch', { name: 'Monday' })).toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Sunday' }),
        ).not.toBeChecked();
        expect(within(day('Monday')).getByText('09:00')).toBeInTheDocument();
        expect(within(day('Monday')).getByText('17:00')).toBeInTheDocument();
        expect(
            within(day('Monday')).getByRole('button', {
                name: 'Lunch break 13:00–14:00',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(day('Sunday')).getByText('Not working'),
        ).toBeInTheDocument();
        expect(screen.getByText('Conference')).toBeInTheDocument();
        // Monday: 16 half hours, minus lunch (2) and the blocked 12:00 (1).
        expect(
            await within(preview()).findByText('13 slots'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save availability' }),
        ).toBeDisabled();
    });

    it('keeps the switches at least 44px high for fingers', async () => {
        await open();

        expect(
            screen.getByRole('switch', { name: 'Monday' }).className,
        ).toContain('h-11');
    });

    it('moves hours by half an hour, and never lets them cross', async () => {
        const user = userEvent.setup();
        await open();
        const monday = day('Monday');

        await user.click(
            within(monday).getByRole('button', {
                name: 'Later by 30 minutes (From)',
            }),
        );
        expect(within(monday).getByText('09:30')).toBeInTheDocument();
        await user.click(
            within(monday).getByRole('button', {
                name: 'Earlier by 30 minutes (To)',
            }),
        );
        expect(within(monday).getByText('16:30')).toBeInTheDocument();
        expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();

        // From is already 06:00 away from the limit: step all the way back and stop.
        const earlier = within(monday).getByRole('button', {
            name: 'Earlier by 30 minutes (From)',
        });
        for (let i = 0; i < 12; i++) {
            if ((earlier as HTMLButtonElement).disabled) {
                break;
            }
            await user.click(earlier);
        }
        expect(within(monday).getByText('06:00')).toBeInTheDocument();
        expect(earlier).toBeDisabled();
    });

    it('updates the preview from the server as the draft changes, and warns about bookings it affects', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('switch', { name: 'Tuesday' }));

        expect(
            await within(preview()).findByText(
                '0 slots',
                {},
                { timeout: 4000 },
            ),
        ).toBeInTheDocument();
        const warning = await screen.findByRole('alert');

        expect(warning).toHaveTextContent(
            'This change affects existing bookings',
        );
        expect(warning).toHaveTextContent('Tue 10:00');
        expect(warning).toHaveTextContent(
            'Nothing is cancelled automatically.',
        );
        expect(
            screen.getByRole('button', { name: 'Save anyway' }),
        ).toBeEnabled();
    });

    it('saves the whole availability and clears the unsaved note', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(screen.getByRole('switch', { name: 'Wednesday' }));
        await user.click(screen.getByRole('button', { name: /^Save/ }));

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Availability saved.',
            ),
        );
        expect((await source.views.availability()).draft.days[2].on).toBe(
            false,
        );
        await waitFor(() =>
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument(),
        );
    });

    it('adds and removes time off, and checks the dates', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Add time off' }));
        expect(
            await screen.findByText(
                'Choose a start and end date. The end cannot be before the start.',
            ),
        ).toBeInTheDocument();

        await user.type(screen.getByLabelText('From date'), '2026-12-01');
        await user.type(screen.getByLabelText('To date'), '2026-12-03');
        await user.type(screen.getByLabelText('Reason'), 'Wedding');
        await user.click(screen.getByRole('button', { name: 'Add time off' }));

        expect(await screen.findByText('Wedding')).toBeInTheDocument();
        expect(screen.getByText('2026-12-01 → 2026-12-03')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', {
                name: 'Remove time off 2026-12-01 → 2026-12-03',
            }),
        );
        expect(screen.queryByText('Wedding')).not.toBeInTheDocument();
    });

    it('blocks and unblocks a time on a weekday', async () => {
        const user = userEvent.setup();
        await open();
        const group = screen
            .getByRole('heading', { name: 'Blocked slots' })
            .closest('section') as HTMLElement;

        // Monday's 12:00 is already blocked.
        expect(
            within(group).getByRole('button', { name: '12:00, Blocked' }),
        ).toHaveAttribute('aria-pressed', 'true');

        await user.click(
            within(group).getByRole('button', { name: '12:00, Blocked' }),
        );
        expect(
            within(group).getByRole('button', { name: '12:00' }),
        ).toHaveAttribute('aria-pressed', 'false');

        await user.click(within(group).getByRole('button', { name: '10:00' }));
        expect(
            within(group).getByRole('button', { name: '10:00, Blocked' }),
        ).toBeInTheDocument();
        // Sunday is not offered: nobody works then.
        expect(
            within(group).queryByRole('button', { name: 'Sun' }),
        ).not.toBeInTheDocument();
    });

    it('turns a day on with the usual hours and lunch break', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('switch', { name: 'Sunday' }));

        expect(
            within(day('Sunday')).getByRole('button', {
                name: /Lunch break|Add lunch break/,
            }),
        ).toBeInTheDocument();
        expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();
    });

    it('runs in Urdu with mirrored layout', async () => {
        const { container } = renderReception(<Availability />, {
            source: receptionSource('u_doc1').source,
            locale: 'ur',
        });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('دستیابی');
        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    });
});
