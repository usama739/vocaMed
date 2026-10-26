import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { createMockDataSource } from '@/lib/data/mock';
import { DEMO_CLINIC_ID } from '@/lib/data/seed';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import CalendarPage from './calendar';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/reception/calendar');
    vi.mocked(notify).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const day = async () => screen.findByRole('table', { name: 'Day schedule' });

describe('Calendar · day', () => {
    it('shows a column per doctor with their appointments in status colours and labels', async () => {
        renderReception(<CalendarPage />);
        const grid = await day();
        await waitFor(() =>
            expect(
                within(grid).getByText('Zainab Hussain'),
            ).toBeInTheDocument(),
        );

        for (const name of [
            'Dr. Sana Malik',
            'Dr. Imran Qureshi',
            'Dr. Hina Farooq',
        ]) {
            expect(
                within(grid).getByRole('columnheader', { name }),
            ).toBeInTheDocument();
        }
        // Each event carries its status as text (with an icon), not just a colour.
        expect(
            within(grid).getByRole('button', {
                name: /Zainab Hussain, Confirmed, 10:30/,
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Monday, 26 October 2026')).toBeInTheDocument();
    });

    it('marks closed hours, and a slot another receptionist is holding', async () => {
        const { db, source } = receptionSource();
        const other = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_other',
            now: () => new Date(),
        });
        const slots = (
            await source.slots.list({
                doctorId: 'd_sana',
                serviceId: 's_general',
                date: '2026-10-26',
            })
        ).filter((s) => s.state === 'free');
        // A half-hour row with a single free slot, so holding it stripes the whole cell.
        const half = (iso: string) => Math.floor(Date.parse(iso) / 1_800_000);
        const alone = slots.find(
            (s) =>
                slots.filter((o) => half(o.startsAt) === half(s.startsAt))
                    .length === 1,
        );

        if (!alone) {
            throw new Error('expected a row with exactly one free slot');
        }

        await other.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: alone.startsAt,
        });

        renderReception(<CalendarPage />, { source });
        const grid = await day();

        expect(await within(grid).findByText('Held')).toBeInTheDocument();
        // Imran starts at 10:00 and Hina at 10:00: the 09:00 row is closed for them.
        expect(within(grid).getAllByText('Closed').length).toBeGreaterThan(0);
    });

    it('opens the booking panel on a free slot, with the doctor and time', async () => {
        const user = userEvent.setup();
        const { runtime } = renderReception(<CalendarPage />);
        const grid = await day();

        const book = await within(grid).findAllByRole('button', {
            name: /^Book \d\d:\d\d, Dr\. Sana Malik$/,
        });
        await user.click(book[0]);

        expect(runtime.openBooking).toHaveBeenCalledWith({
            doctorId: 'd_sana',
            startsAt: expect.stringMatching(/^2026-10-26T/),
        });
    });

    it('moves an appointment: select it, choose a free slot, confirm', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<CalendarPage />);
        const grid = await day();
        const before = (await source.appointments.get('a_004')).startsAt;

        await user.click(
            await within(grid).findByRole('button', {
                name: /Zainab Hussain, Confirmed/,
            }),
        );
        expect(
            await screen.findByText(
                'Moving Zainab Hussain. Choose a free slot.',
            ),
        ).toBeInTheDocument();

        // Only free slots of the same doctor can take it.
        const targets = within(grid).getAllByRole('button', {
            name: /^Move to \d\d:\d\d, Dr\. Sana Malik$/,
        });
        await user.click(targets[0]);

        const dialog = await screen.findByRole('alertdialog');
        expect(
            within(dialog).getByText('Move this appointment?'),
        ).toBeInTheDocument();
        expect(dialog).toHaveTextContent('The patient will be messaged.');
        await user.click(
            within(dialog).getByRole('button', { name: 'Yes, move it' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Appointment moved. The patient will be sent the new time.',
            ),
        );
        expect((await source.appointments.get('a_004')).startsAt).not.toBe(
            before,
        );
    });

    it('can back out of a move without changing anything', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<CalendarPage />);
        const grid = await day();
        const before = (await source.appointments.get('a_004')).startsAt;

        await user.click(
            await within(grid).findByRole('button', {
                name: /Zainab Hussain, Confirmed/,
            }),
        );
        await user.click(
            await screen.findByRole('button', { name: 'Cancel move' }),
        );

        expect(
            screen.queryByText(/Choose a free slot/),
        ).not.toBeInTheDocument();
        expect((await source.appointments.get('a_004')).startsAt).toBe(before);
    });

    it('does not let a finished appointment be picked up', async () => {
        renderReception(<CalendarPage />);
        const grid = await day();

        const done = await within(grid).findByRole('link', {
            name: /Muhammad Usman, Done/,
        });
        expect(done).toHaveAttribute('href', '/reception/appointments/a_001');
    });

    it('filters to one doctor', async () => {
        const user = userEvent.setup();
        renderReception(<CalendarPage />);
        const grid = await day();
        await within(grid).findByText('Zainab Hussain');

        await user.click(
            within(screen.getByRole('group', { name: 'Doctor' })).getByRole(
                'button',
                { name: 'Dr. Imran Qureshi' },
            ),
        );

        await waitFor(() =>
            expect(
                within(grid).queryByRole('columnheader', {
                    name: 'Dr. Sana Malik',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(window.location.search).toContain('doctor=d_imran');
    });

    it('goes back and forward a day, and returns to today', async () => {
        const user = userEvent.setup();
        renderReception(<CalendarPage />);
        await day();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(
            await screen.findByText('Tuesday, 27 October 2026'),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Today' }));
        expect(
            await screen.findByText('Monday, 26 October 2026'),
        ).toBeInTheDocument();
    });

    it('says a day has no bookings', async () => {
        window.history.replaceState(
            null,
            '',
            '/reception/calendar?date=2026-11-03',
        );
        renderReception(<CalendarPage />);

        expect(
            await screen.findByText('No bookings on this day'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Click any free slot to book.'),
        ).toBeInTheDocument();
    });

    it('shows Sunday as closed for everyone', async () => {
        window.history.replaceState(
            null,
            '',
            '/reception/calendar?date=2026-11-01',
        );
        renderReception(<CalendarPage />);
        await day();

        expect(
            await screen.findByText('Sunday, 1 November 2026'),
        ).toBeInTheDocument();
        expect(screen.getByText('Closed')).toBeInTheDocument();
    });
});

describe('Calendar · week and month', () => {
    it('shows the open days of the week with appointment chips that link to them', async () => {
        window.history.replaceState(null, '', '/reception/calendar?view=week');
        renderReception(<CalendarPage />);
        const grid = await screen.findByRole('table', {
            name: 'Week schedule',
        });

        // Monday to Saturday: Sunday is closed and left out.
        const heads = within(grid).getAllByRole('columnheader');
        expect(heads).toHaveLength(7);
        expect(heads.map((h) => h.textContent).join(' ')).not.toMatch(/Sun/);
        await waitFor(() =>
            expect(
                within(grid).getAllByRole('link', { name: /Zainab Hussain/ })
                    .length,
            ).toBeGreaterThan(0),
        );
    });

    it('switches views with the Day, Week and Month buttons', async () => {
        const user = userEvent.setup();
        renderReception(<CalendarPage />);
        await day();
        const views = screen.getByRole('group', { name: 'Calendar view' });

        await user.click(within(views).getByRole('button', { name: 'Week' }));
        expect(
            await screen.findByRole('table', { name: 'Week schedule' }),
        ).toBeInTheDocument();
        await user.click(within(views).getByRole('button', { name: 'Month' }));
        expect(
            await screen.findByRole('table', { name: 'Month overview' }),
        ).toBeInTheDocument();
        expect(window.location.search).toContain('view=month');
    });

    it('opens a day from the month view', async () => {
        window.history.replaceState(null, '', '/reception/calendar?view=month');
        const user = userEvent.setup();
        renderReception(<CalendarPage />);
        const grid = await screen.findByRole('table', {
            name: 'Month overview',
        });

        expect(screen.getByText('October 2026')).toBeInTheDocument();
        await user.click(
            await within(grid).findByRole('cell', { name: /27 Oct/ }),
        );

        expect(await day()).toBeInTheDocument();
        expect(
            await screen.findByText('Tuesday, 27 October 2026'),
        ).toBeInTheDocument();
    });

    it('runs in Urdu with the first doctor at the start edge', async () => {
        const { container } = renderReception(<CalendarPage />, {
            locale: 'ur',
        });
        await screen.findByRole('table', { name: 'دن کا شیڈول' });

        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'کیلنڈر',
        );
    });
});
