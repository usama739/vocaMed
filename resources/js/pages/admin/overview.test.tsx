import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import AdminOverview from './overview';

// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState({}, '', '/admin');
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (options = {}) => {
    const source = receptionSource('u_admin').source;
    const result = renderReception(<AdminOverview />, { source, ...options });
    await screen.findByRole('group', { name: 'Period' });
    await screen.findByText('Appointments booked');

    return { ...result, source };
};

describe('Admin overview', () => {
    it('shows the title, the period switch and the eight numbers with how they moved', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Overview' }),
        ).toBeInTheDocument();
        const period = screen.getByRole('group', { name: 'Period' });
        expect(
            within(period).getByRole('button', { name: 'This month' }),
        ).toHaveAttribute('aria-pressed', 'true');

        for (const label of [
            'Appointments booked',
            'Visits completed',
            'Cancellation rate',
            'No-show rate',
            'New patients',
            'Reminder delivery',
            'Confirmed by patients',
            'Doctor time used',
        ]) {
            // "Doctor time used" is also the title of its own card below.
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        }

        expect(
            screen.getByRole('heading', { level: 2, name: 'This month' }),
        ).toBeInTheDocument();
        expect(screen.getByText('vs 1–26 September')).toBeInTheDocument();
        expect(screen.getAllByText(/^Before: /).length).toBe(8);
    });

    it('changes the period and keeps it in the address', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Last 7 days' }));

        await screen.findByText('vs the 7 days before');
        expect(window.location.search).toBe('?period=last7');
        expect(
            screen.getByRole('button', { name: 'Last 7 days' }),
        ).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'Last 3 months' }));
        await screen.findByText('vs the 3 months before');
    });

    it('warns about failed messages and links to where they are fixed', async () => {
        await open();

        const failed = screen
            .getAllByRole('alert')
            .find((a) => /could not be delivered/.test(a.textContent ?? ''))!;

        expect(failed).toBeInTheDocument();
        expect(
            within(failed).getByRole('link', {
                name: 'Review failed messages',
            }),
        ).toHaveAttribute('href', '/reception/notifications?status=failed');
        // Every sample doctor has hours, so there is no second warning.
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('names a doctor with no hours and links to their profile', async () => {
        const { source } = receptionSource('u_admin');
        const draft = (await source.views.adminDoctor({ doctorId: 'new' }))!
            .draft;
        const doctor = await source.doctors.create({
            profile: {
                name: 'Dr. No Hours',
                specialty: '',
                languages: [],
                serviceIds: [],
                active: true,
            },
            availability: {
                ...draft,
                days: draft.days.map((d) => ({ ...d, on: false })),
            },
        });

        renderReception(<AdminOverview />, { source });
        await screen.findByText(
            'Dr. No Hours has no working hours set, so cannot be booked.',
        );

        expect(
            screen.getByRole('link', { name: 'Set availability' }),
        ).toHaveAttribute('href', `/admin/doctors/${doctor.id}`);
    });

    it('draws the trend with a text summary, and swaps it for a table', async () => {
        const user = userEvent.setup();
        await open();

        const chart = screen.getByTestId('trend-chart');
        expect(chart).toHaveAttribute(
            'aria-label',
            expect.stringMatching(
                /^Line chart, 26 points\. Total \d+ bookings, previous period \d+\.$/,
            ),
        );

        const toggle = screen.getByRole('button', { name: 'Show as table' });
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await user.click(toggle);

        const table = screen.getByRole('table', { name: 'Bookings over time' });
        // One header row and one row per day so far this month.
        expect(within(table).getAllByRole('row')).toHaveLength(27);
        expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Show as chart' }));
        expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
    });

    it('breaks bookings down by day, outcome, source, doctor and service', async () => {
        await open();

        expect(
            screen.getByRole('heading', { name: 'Busiest days' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                /is the busiest day\. The clinic is closed on Sunday\./,
            ),
        ).toBeInTheDocument();
        const outcomes = screen
            .getByRole('heading', { name: 'What happened to bookings' })
            .closest('section')!;
        for (const label of [
            'Completed',
            'Still to come',
            'Cancelled',
            'No-show',
        ]) {
            expect(within(outcomes).getByText(label)).toBeInTheDocument();
        }
        expect(within(outcomes).getByText(/^Voice: /)).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Doctor time used' }),
        ).toBeInTheDocument();
        const services = screen
            .getByRole('heading', { name: 'Most booked services' })
            .closest('section')!;
        expect(
            within(services).getByText('General consultation'),
        ).toBeInTheDocument();
    });

    it('lists today per doctor with their real counts and next free slot', async () => {
        await open();

        const table = screen.getByRole('table', {
            name: 'Today at a glance, per doctor',
        });
        const sana = within(table)
            .getAllByRole('row')
            .find((r) => /Dr\. Sana Malik/.test(r.textContent ?? ''))!;
        const cells = within(sana)
            .getAllByRole('cell')
            .map((c) => c.textContent);

        expect(cells[0]).toBe('Dr. Sana Malik');
        expect(Number(cells[1])).toBeGreaterThan(0);
        expect(cells[5]).toMatch(/\d{2}:\d{2}/);
    });

    it('shows a loading state, an error with retry, and an empty clinic', async () => {
        const loading = renderReception(<AdminOverview />, {
            source: receptionSource('u_admin').source,
            forced: 'loading',
        });
        expect(
            await screen.findByRole('status', { name: 'Loading the overview' }),
        ).toBeInTheDocument();
        loading.unmount();

        const failed = renderReception(<AdminOverview />, {
            source: receptionSource('u_admin').source,
            forced: 'error',
        });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
        failed.unmount();

        renderReception(<AdminOverview />, {
            source: receptionSource('u_admin').source,
            forced: 'empty',
        });
        expect(
            await screen.findByText('No appointments in this period yet'),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getAllByText(/^Before: 0/).length).toBe(8),
        );
    });

    it('reads in Urdu with the same data', async () => {
        const { unmount } = renderReception(<AdminOverview />, {
            source: receptionSource('u_admin').source,
            locale: 'ur',
        });

        expect(
            await screen.findByRole('heading', { level: 1, name: 'جائزہ' }),
        ).toBeInTheDocument();
        expect(await screen.findByText('بُک اپائنٹمنٹس')).toBeInTheDocument();
        expect(
            screen.getByText(/مصروف دن ہے۔ کلینک اتوار کو بند ہے۔/),
        ).toBeInTheDocument();
        unmount();
    });
});
