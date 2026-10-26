import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { freezeClock, renderReception } from '@/test/reception';
import Appointments from './appointments';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/reception/appointments');
    vi.mocked(notify).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const ready = async () => {
    const table = await screen.findByRole('table', { name: 'Appointments' });
    await waitFor(() =>
        expect(within(table).getAllByRole('row').length).toBeGreaterThan(1),
    );

    return table;
};

describe('Appointments', () => {
    it('lists the first page, with the total and paging', async () => {
        renderReception(<Appointments />);
        const table = await ready();

        expect(within(table).getAllByRole('row')).toHaveLength(11);
        expect(screen.getByText('22 appointments')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    });

    it('moves between pages', async () => {
        const user = userEvent.setup();
        renderReception(<Appointments />);
        await ready();

        await user.click(screen.getByRole('button', { name: 'Next' }));

        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(window.location.search).toContain('page=2');
    });

    it('filters by doctor and status, and keeps the filters in the address', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Appointments />);
        await ready();
        const expected = (
            await source.appointments.list({ doctorId: 'd_hina' })
        ).total;

        await user.click(
            within(screen.getByRole('group', { name: 'Doctor' })).getByRole(
                'button',
                { name: 'Dr. Hina Farooq' },
            ),
        );

        expect(
            await screen.findByText(`${expected} appointments`),
        ).toBeInTheDocument();
        expect(window.location.search).toContain('doctor=d_hina');

        await user.click(
            within(screen.getByRole('group', { name: 'Status' })).getByRole(
                'button',
                { name: 'Cancelled' },
            ),
        );
        await waitFor(() =>
            expect(window.location.search).toContain('status=cancelled'),
        );
    });

    it('searches by patient name', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Appointments />);
        await ready();
        const { total } = await source.appointments.list({ patient: 'Zainab' });

        await user.type(
            screen.getByRole('searchbox', {
                name: 'Search by patient name or phone',
            }),
            'Zainab',
        );

        expect(
            await screen.findByText(
                `${total} appointment${total === 1 ? '' : 's'}`,
            ),
        ).toBeInTheDocument();
    });

    it('shows an empty state with a way back when nothing matches', async () => {
        const user = userEvent.setup();
        renderReception(<Appointments />);
        await ready();

        await user.type(
            screen.getByRole('searchbox', {
                name: 'Search by patient name or phone',
            }),
            'zzzzzz',
        );

        expect(
            await screen.findByText('No appointments match'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Clear filters' }));
        expect(await screen.findByText('22 appointments')).toBeInTheDocument();
    });

    it('cancels an appointment only after confirming', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Appointments />);
        await ready();

        // Newest first: the first open row belongs to a patient who can be cancelled.
        const cancel = screen.getAllByRole('button', {
            name: /^Cancel .*’s appointment$/,
        })[0];
        const patient = /^Cancel (.*)’s appointment$/.exec(
            cancel.getAttribute('aria-label') ?? '',
        )![1];
        await user.click(cancel);

        const dialog = await screen.findByRole('alertdialog');
        expect(
            within(dialog).getByText(`Cancel ${patient}’s appointment?`),
        ).toBeInTheDocument();
        // Focus starts on the safe choice.
        expect(
            within(dialog).getByRole('button', { name: 'Keep appointment' }),
        ).toHaveFocus();

        await user.click(
            within(dialog).getByRole('button', { name: 'Yes, cancel it' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Appointment cancelled.',
            ),
        );
        expect(
            (await source.appointments.list({ status: 'cancelled' })).total,
        ).toBeGreaterThan(3);
    });

    it('opens the panel to reschedule, and links to the appointment', async () => {
        const user = userEvent.setup();
        const { runtime } = renderReception(<Appointments />);
        const table = await ready();

        await user.click(
            screen.getAllByRole('button', { name: /^Reschedule / })[0],
        );
        expect(runtime.openReschedule).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.stringMatching(/^a_/) }),
        );
        expect(
            within(table).getAllByRole('link', { name: /^View / })[0],
        ).toHaveAttribute(
            'href',
            expect.stringMatching(/^\/reception\/appointments\/a_/),
        );
    });

    it('does not offer reschedule or cancel for a finished appointment', async () => {
        const user = userEvent.setup();
        renderReception(<Appointments />);
        await ready();

        await user.click(
            within(screen.getByRole('group', { name: 'Status' })).getByRole(
                'button',
                { name: 'Done' },
            ),
        );
        await waitFor(() =>
            expect(
                screen.queryAllByRole('button', { name: /^Reschedule / }),
            ).toHaveLength(0),
        );
    });

    it('says CSV export is planned instead of hiding it', async () => {
        const user = userEvent.setup();
        renderReception(<Appointments />);
        await ready();

        await user.click(screen.getByRole('button', { name: /Export CSV/ }));

        expect(notify).toHaveBeenCalledWith(
            'info',
            expect.stringContaining('phase 2'),
        );
    });

    it('can be sorted by when, oldest first', async () => {
        const user = userEvent.setup();
        renderReception(<Appointments />);
        const table = await ready();
        const first = () =>
            within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[0]
                .textContent;
        const before = first();

        await user.click(within(table).getByRole('button', { name: 'When' }));

        await waitFor(() => expect(first()).not.toBe(before));
        expect(window.location.search).toContain('sort=asc');
    });

    it('runs in Urdu', async () => {
        renderReception(<Appointments />, { locale: 'ur' });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('اپائنٹمنٹس');
        expect(await screen.findByText('22 اپائنٹمنٹس')).toBeInTheDocument();
    });
});
