import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Doctors from './doctors';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    vi.mocked(notify).mockClear();
    window.history.replaceState(null, '', '/admin/doctors');
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (options: Parameters<typeof renderReception>[1] = {}) => {
    const source = options.source ?? receptionSource('u_admin').source;
    const result = renderReception(<Doctors />, { ...options, source });
    await screen.findByRole('table', { name: 'Doctors' });

    return { ...result, source };
};

const row = (id: string) =>
    document.querySelector(`[data-doctor="${id}"]`) as HTMLElement;

describe('Doctors', () => {
    it('lists every doctor with specialty, status and next free slot', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Doctors' }),
        ).toBeInTheDocument();
        expect(within(row('d_sana')).getByText('Dr. Sana Malik')).toBeVisible();
        expect(
            within(row('d_sana')).getByText('General Physician'),
        ).toBeVisible();
        expect(within(row('d_imran')).getByText('Paediatrics')).toBeVisible();
        expect(within(row('d_sana')).getByText('Active')).toBeVisible();
        // Monday 10:15 and Dr. Sana works today, so the next free slot is a time today.
        expect(
            within(row('d_sana')).getByText(/^Today, \d\d:\d\d$/),
        ).toBeVisible();
        expect(screen.getByText('Showing 3 of 3 doctors')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Add doctor' }),
        ).toHaveAttribute('href', '/admin/doctors/new');
        expect(
            within(row('d_sana')).getByRole('link', {
                name: 'Open Dr. Sana Malik',
            }),
        ).toHaveAttribute('href', '/admin/doctors/d_sana');
    });

    it('searches by name or specialty and filters by status', async () => {
        const user = userEvent.setup();
        await open();

        await user.type(
            screen.getByRole('searchbox', { name: 'Search doctors' }),
            'paed',
        );
        await waitFor(() => expect(row('d_sana')).toBeNull());
        expect(row('d_imran')).not.toBeNull();
        expect(screen.getByText('Showing 1 of 3 doctors')).toBeInTheDocument();

        await user.clear(
            screen.getByRole('searchbox', { name: 'Search doctors' }),
        );
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Filter by status' }),
            'inactive',
        );
        expect(
            await screen.findByText('No doctors match your search.'),
        ).toBeInTheDocument();
    });

    it('asks before deactivating, says what happens to appointments, and keeps them', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            within(row('d_sana')).getByRole('button', {
                name: 'Deactivate Dr. Sana Malik',
            }),
        );
        const dialog = await screen.findByRole('alertdialog');

        expect(dialog).toHaveTextContent('Deactivate Dr. Sana Malik?');
        expect(dialog).toHaveTextContent(/stay on the calendar/);

        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        expect((await source.doctors.get('d_sana')).active).toBe(true);

        await user.click(
            within(row('d_sana')).getByRole('button', {
                name: 'Deactivate Dr. Sana Malik',
            }),
        );
        await user.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Deactivate',
            }),
        );

        await waitFor(() =>
            expect(within(row('d_sana')).getByText('Inactive')).toBeVisible(),
        );
        expect(notify).toHaveBeenCalledWith(
            'success',
            'Dr. Sana Malik was deactivated.',
        );
        expect((await source.doctors.get('d_sana')).active).toBe(false);
        // Nothing was cancelled.
        const kept = await source.appointments.list({ perPage: 100 });
        expect(
            kept.items.filter(
                (a) => a.doctorId === 'd_sana' && a.status !== 'cancelled',
            ).length,
        ).toBeGreaterThan(0);

        await user.click(
            within(row('d_sana')).getByRole('button', {
                name: 'Reactivate Dr. Sana Malik',
            }),
        );
        await waitFor(() =>
            expect(within(row('d_sana')).getByText('Active')).toBeVisible(),
        );
        expect(notify).toHaveBeenCalledWith(
            'success',
            'Dr. Sana Malik was reactivated.',
        );
    });

    it('shows the empty state with a way to add the first doctor', async () => {
        renderReception(<Doctors />, {
            source: receptionSource('u_admin').source,
            forced: 'empty',
        });

        expect(await screen.findByText('No doctors yet')).toBeInTheDocument();
        expect(
            screen.getAllByRole('link', { name: 'Add doctor' }),
        ).toHaveLength(2);
    });

    it('shows a loading skeleton and an error with Retry', async () => {
        const { unmount } = renderReception(<Doctors />, {
            source: receptionSource('u_admin').source,
            forced: 'loading',
        });

        expect(
            await screen.findByRole('table', { name: 'Doctors' }),
        ).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByText('Loading doctors')).toBeInTheDocument();
        unmount();

        renderReception(<Doctors />, {
            source: receptionSource('u_admin').source,
            forced: 'error',
        });
        expect(
            await screen.findByRole('button', { name: /try again|retry/i }),
        ).toBeInTheDocument();
    });

    it('turns a receptionist away (the server refuses the view)', async () => {
        renderReception(<Doctors />, {
            source: receptionSource('u_recep').source,
        });

        expect(
            await screen.findByRole('button', { name: /try again|retry/i }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('mirrors in Urdu with translated labels', async () => {
        renderReception(<Doctors />, {
            source: receptionSource('u_admin').source,
            locale: 'ur',
        });

        expect(
            await screen.findByRole('heading', { level: 1, name: 'ڈاکٹرز' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('کل 3 میں سے 3 ڈاکٹرز دکھائے جا رہے ہیں'),
        ).toBeInTheDocument();
        expect(screen.getAllByText('فعال').length).toBeGreaterThan(0);
    });
});
