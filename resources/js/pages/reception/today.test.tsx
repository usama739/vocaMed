import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Today from './today';

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

const summary = (label: string) => {
    const group = screen.getByRole('group', { name: /summary/i });

    return within(group).getByText(label).previousElementSibling?.textContent;
};

describe('Today', () => {
    it('shows the date, a labelled sample, the summary and every doctor’s day', async () => {
        renderReception(<Today />);

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Today' }),
        ).toBeInTheDocument();
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        expect(screen.getByText(/Monday, 26 October/)).toBeInTheDocument();
        expect(screen.getAllByText('Sample data').length).toBeGreaterThan(0);
        expect(summary('Booked or confirmed')).toBe('3');
        expect(summary('Arrived')).toBe('1');
        expect(summary('Done')).toBe('1');
        expect(summary('No-show')).toBe('1');
        expect(
            screen.getByRole('region', { name: 'Dr. Imran Qureshi' }),
        ).toBeInTheDocument();
        // The third doctor has nothing booked: an empty state with a way to book.
        const hina = screen.getByRole('region', { name: 'Dr. Hina Farooq' });
        expect(
            within(hina).getByText('No appointments today'),
        ).toBeInTheDocument();
    });

    it('moves a patient to Arrived, updates the summary, and undoes it when pressed again', async () => {
        const user = userEvent.setup();
        renderReception(<Today />);
        const sana = await screen.findByRole('region', {
            name: 'Dr. Sana Malik',
        });
        const row = within(sana)
            .getByText('Zainab Hussain')
            .closest('li') as HTMLElement;

        expect(row).toHaveAttribute('data-status', 'confirmed');
        await user.click(within(row).getByRole('button', { name: 'Arrived' }));

        await waitFor(() =>
            expect(row).toHaveAttribute('data-status', 'arrived'),
        );
        expect(
            within(row).getByRole('button', { name: 'Arrived' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await waitFor(() => expect(summary('Arrived')).toBe('2'));

        await user.click(within(row).getByRole('button', { name: 'Arrived' }));
        await waitFor(() =>
            expect(row).toHaveAttribute('data-status', 'confirmed'),
        );
    });

    it('disables stages a finished appointment cannot move to', async () => {
        renderReception(<Today />);
        const sana = await screen.findByRole('region', {
            name: 'Dr. Sana Malik',
        });
        const done = within(sana)
            .getByText('Muhammad Usman')
            .closest('li') as HTMLElement;

        expect(
            within(done).getByRole('button', { name: 'Arrived' }),
        ).toBeDisabled();
        expect(
            within(done).getByRole('button', { name: 'Done' }),
        ).toBeEnabled();
    });

    it('adds a walk-in to the chosen doctor’s queue as arrived and tells the receptionist', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Today />);
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        await user.type(screen.getByLabelText('Walk-in patient'), 'Hira Anwar');
        await user.click(screen.getByRole('button', { name: 'Add walk-in' }));

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Hira Anwar added to Dr. Sana Malik’s queue.',
            ),
        );
        const page = await source.appointments.list({
            from: '2026-10-26',
            to: '2026-10-26',
            perPage: 100,
        });
        const created = page.items.find(
            (a) =>
                a.source === 'walk_in' &&
                a.status === 'arrived' &&
                a.patientId !== 'p_3',
        );

        expect(created).toBeTruthy();
        // Added with a name only: the patient is saved without a phone number.
        expect((await source.patients.get(created!.patientId)).phone).toBe('');
        await screen.findByText('Hira Anwar');
    });

    it('asks for a name before adding a walk-in', async () => {
        const user = userEvent.setup();
        renderReception(<Today />);
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        await user.click(screen.getByRole('button', { name: 'Add walk-in' }));

        expect(
            await screen.findByText('Enter the patient’s name.'),
        ).toBeInTheDocument();
        expect(notify).not.toHaveBeenCalled();
    });

    it('rejects a phone number that is too short', async () => {
        const user = userEvent.setup();
        renderReception(<Today />);
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        await user.type(screen.getByLabelText('Walk-in patient'), 'Hira Anwar');
        await user.type(screen.getByLabelText(/Phone/), '0300 12');
        await user.click(screen.getByRole('button', { name: 'Add walk-in' }));

        expect(
            await screen.findByText(/at least 10 digits/),
        ).toBeInTheDocument();
    });

    it('opens the booking panel for a doctor with nothing booked, and for voice', async () => {
        const user = userEvent.setup();
        const { runtime } = renderReception(<Today />);
        const hina = await screen.findByRole('region', {
            name: 'Dr. Hina Farooq',
        });

        await user.click(
            within(hina).getByRole('button', { name: 'Book a time' }),
        );
        expect(runtime.openBooking).toHaveBeenCalledWith({
            doctorId: 'd_hina',
        });

        await user.click(
            screen.getByRole('button', { name: /Speak a booking/ }),
        );
        expect(runtime.openVoice).toHaveBeenCalled();
    });

    it('shows the loading, error and empty states on request', async () => {
        const first = renderReception(<Today />, { forced: 'loading' });
        expect(
            await screen.findByRole('status', {
                name: 'Loading today’s schedule',
            }),
        ).toBeInTheDocument();
        first.unmount();

        const second = renderReception(<Today />, { forced: 'error' });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
        second.unmount();
    });

    it('mirrors in Urdu and keeps times left to right', async () => {
        const { container } = renderReception(<Today />, { locale: 'ur' });
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'آج',
        );
        expect(screen.getByText('09:00').closest('[dir="ltr"]')).toBeTruthy();
    });

    it('treats a day off as such', async () => {
        // Sunday: nobody works.
        freezeClock(new Date('2026-10-25T05:15:00.000Z'));
        renderReception(<Today />, { source: receptionSource().source });
        await screen.findByRole('region', { name: 'Dr. Sana Malik' });

        expect(screen.getAllByText('Not working today')).toHaveLength(3);
    });
});
