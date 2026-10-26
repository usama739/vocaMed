import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import DoctorOverview from './overview';

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

const open = async (options = {}) => {
    const source = receptionSource('u_doc1').source;
    const result = renderReception(<DoctorOverview />, { source, ...options });
    await screen.findByRole('region', { name: 'Next patient' });

    return { ...result, source };
};

const summary = (label: string) =>
    within(screen.getByRole('group', { name: 'Today’s summary' })).getByText(
        label,
    ).previousElementSibling?.textContent;

describe('Doctor overview', () => {
    it('shows the date and doctor, the summary and the requests badge', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Today' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Monday, 26 October · Dr\. Sana Malik/),
        ).toBeInTheDocument();
        expect(summary('Today in total')).toBe('6');
        expect(summary('Waiting')).toBe('1');
        expect(summary('In consultation')).toBe('1');
        expect(
            Number(summary('Days with bookings ahead')),
        ).toBeGreaterThanOrEqual(3);

        const requests = screen.getByRole('link', {
            name: 'Reschedule requests, 2 waiting',
        });

        expect(requests).toHaveAttribute('href', '/doctor/requests');
    });

    it('shows only the doctor’s own day, in time order', async () => {
        await open();
        const list = screen
            .getByRole('region', { name: 'Today’s appointments' })
            .querySelectorAll('li');
        const times = [...list].map(
            (li) => li.querySelector('span[dir=ltr]')?.textContent,
        );

        expect(list).toHaveLength(6);
        expect(times).toEqual([...times].sort());
        // Dr. Imran's patients are not here.
        expect(screen.queryByText('Hamza Sheikh')).not.toBeInTheDocument();
    });

    it('puts the patient in consultation first in the next-patient card', async () => {
        await open();
        const card = screen.getByRole('region', { name: 'Next patient' });

        expect(within(card).getByText('Fatima Zahra')).toBeInTheDocument();
        expect(within(card).getByText('In consultation')).toBeInTheDocument();
        expect(
            within(card).getByRole('button', { name: 'Mark done' }),
        ).toBeEnabled();
    });

    it('marks the consultation done, then offers the next arrived patient', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const card = screen.getByRole('region', { name: 'Next patient' });

        await user.click(
            within(card).getByRole('button', { name: 'Mark done' }),
        );

        await waitFor(async () =>
            expect((await source.appointments.get('a_002')).status).toBe(
                'done',
            ),
        );
        const next = await screen.findByRole('button', {
            name: 'Call in and start',
        });

        expect(
            within(
                screen.getByRole('region', { name: 'Next patient' }),
            ).getByText('Ali Raza'),
        ).toBeInTheDocument();
        await user.click(next);
        await waitFor(async () =>
            expect((await source.appointments.get('a_003')).status).toBe(
                'in_consultation',
            ),
        );
    });

    it('lets the doctor start an arrived patient from the list, and nothing else', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            screen.getByRole('button', {
                name: 'Start consultation, Ali Raza',
            }),
        );

        await waitFor(async () =>
            expect((await source.appointments.get('a_003')).status).toBe(
                'in_consultation',
            ),
        );
        // Confirmed and booked patients have no action: reception marks them as arrived.
        const confirmed = screen
            .getByText('Zainab Hussain')
            .closest('li') as HTMLElement;

        expect(
            within(confirmed).queryByRole('button', { name: /Start|done/ }),
        ).toBeNull();
        expect(
            screen.getByText('Reception marks patients as arrived.', {
                exact: false,
            }),
        ).toBeInTheDocument();
    });

    it('opens a read-only panel with the appointment’s details', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(
            screen.getByRole('button', { name: 'Details, Zainab Hussain' }),
        );

        const panel = await screen.findByRole('dialog');

        expect(within(panel).getByText('0345 1234570')).toBeInTheDocument();
        expect(
            within(panel).getByText(
                'To change this appointment, ask reception.',
            ),
        ).toBeInTheDocument();
        expect(
            within(panel).queryByRole('button', { name: /cancel|reschedule/i }),
        ).toBeNull();
    });

    it('says when there is nothing today, with a way on', async () => {
        renderReception(<DoctorOverview />, {
            source: receptionSource('u_doc1').source,
            forced: 'empty',
        });

        expect(
            await screen.findByText('No appointments today'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open my schedule' }),
        ).toHaveAttribute('href', '/doctor/schedule');
    });

    it('says when all of today’s patients are done', async () => {
        const { db, source } = receptionSource('u_doc1');

        for (const a of db.appointments) {
            if (a.doctorId === 'd_sana') {
                a.status = 'done';
            }
        }

        renderReception(<DoctorOverview />, { source });

        expect(
            await screen.findByText('All of today’s patients are done.'),
        ).toBeInTheDocument();
    });

    it('shows the error state on request, and mirrors in Urdu', async () => {
        const first = renderReception(<DoctorOverview />, {
            source: receptionSource('u_doc1').source,
            forced: 'error',
        });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
        first.unmount();

        const { container } = renderReception(<DoctorOverview />, {
            source: receptionSource('u_doc1').source,
            locale: 'ur',
        });
        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('آج');
        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    });
});
