import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import DoctorSchedule from './schedule';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/doctor/schedule');
});

afterEach(() => {
    vi.useRealTimers();
});

const open = () =>
    renderReception(<DoctorSchedule />, {
        source: receptionSource('u_doc1').source,
    });

const day = () => screen.findByRole('table', { name: 'Day schedule' });

describe('Doctor schedule', () => {
    it('shows one column of the doctor’s own day, with free time marked', async () => {
        open();
        const grid = await day();

        expect(
            await within(grid).findByRole('button', {
                name: /Zainab Hussain, Confirmed, 10:30/,
            }),
        ).toBeInTheDocument();
        expect(within(grid).getAllByRole('columnheader')).toHaveLength(2);
        expect(within(grid).getAllByText('Free').length).toBeGreaterThan(0);
        // Read only: nothing to book, nothing to drag.
        expect(
            within(grid).queryByRole('button', { name: /^Book/ }),
        ).toBeNull();
        expect(screen.getByText('Read only · Sample data')).toBeInTheDocument();
    });

    it('does not show other doctors’ patients', async () => {
        open();
        const grid = await day();
        await within(grid).findByText('Zainab Hussain');

        expect(within(grid).queryByText('Hamza Sheikh')).toBeNull();
    });

    it('opens a read-only panel for an appointment, and closes it with Escape', async () => {
        const user = userEvent.setup();
        open();
        const grid = await day();

        await user.click(
            await within(grid).findByRole('button', {
                name: /Zainab Hussain, Confirmed/,
            }),
        );

        const panel = await screen.findByRole('dialog');
        expect(within(panel).getByText('Zainab Hussain')).toBeInTheDocument();
        expect(within(panel).getByText('Dr. Sana Malik')).toBeInTheDocument();
        expect(
            within(panel).getByText(
                'To change this appointment, ask reception.',
            ),
        ).toBeInTheDocument();

        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });

    it('switches to the week and steps through days', async () => {
        const user = userEvent.setup();
        open();
        await day();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(
            await screen.findByText('Tuesday, 27 October 2026'),
        ).toBeInTheDocument();

        await user.click(
            within(
                screen.getByRole('group', { name: 'Schedule view' }),
            ).getByRole('button', { name: 'Week' }),
        );
        const week = await screen.findByRole('table', {
            name: 'Week schedule',
        });

        expect(within(week).getAllByRole('columnheader')).toHaveLength(7);
        expect(window.location.search).toContain('view=week');
    });

    it('says when a day is empty', async () => {
        window.history.replaceState(
            null,
            '',
            '/doctor/schedule?date=2026-11-03',
        );
        open();

        expect(
            await screen.findByText('No appointments on this day'),
        ).toBeInTheDocument();
    });

    it('runs in Urdu', async () => {
        renderReception(<DoctorSchedule />, {
            source: receptionSource('u_doc1').source,
            locale: 'ur',
        });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('میرا شیڈول');
        expect(
            await screen.findByRole('table', { name: 'دن کا شیڈول' }),
        ).toBeInTheDocument();
    });
});
