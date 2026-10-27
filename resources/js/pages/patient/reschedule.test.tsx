import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data';
import { freezeClock } from '@/test/reception';
import { renderPatient } from '@/test/patient';
import Reschedule from './reschedule';

const page = vi.hoisted(() => ({ token: 'sample-booked' }));

vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
    usePage: () => ({ props: { token: page.token } }),
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState({}, '', '/');
    page.token = 'sample-booked';
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (token: string, options = {}) => {
    page.token = token;
    const result = renderPatient(<Reschedule />, options);
    await screen.findByRole('heading', { level: 1 });

    return result;
};

const days = () => screen.getByRole('group', { name: 'Day' });
const times = () => screen.getByRole('group', { name: 'Time' });

describe('Reschedule', () => {
    it('shows the doctor, the current time and fourteen days, with closed days disabled', async () => {
        await open('sample-booked');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Choose a new time',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Showing free times with Dr. Imran Qureshi over the next 14 days.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Tue 27 October, 11:00')).toBeInTheDocument();
        expect(within(days()).getAllByRole('button')).toHaveLength(14);

        const sunday = within(days()).getByRole('button', {
            name: /Sunday 1 November, Closed/,
        });
        expect(sunday).toBeDisabled();
        expect(
            within(days()).getByRole('button', { name: 'Tuesday 27 October' }),
        ).toBeEnabled();
        expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
            'href',
            '/p/sample-booked',
        );
    });

    it('waits for a time before it can be confirmed, then moves the visit', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-booked');
        const submit = screen.getByRole('button', { name: 'Choose a time' });
        expect(submit).toBeDisabled();

        await user.click(
            within(days()).getByRole('button', {
                name: 'Wednesday 28 October',
            }),
        );
        const first = within(times()).getAllByRole('button')[0];
        await user.click(first);
        expect(first).toHaveAttribute('aria-pressed', 'true');

        const confirm = screen.getByRole('button', {
            name: 'Confirm new time',
        });
        expect(confirm).toBeEnabled();
        const move = vi.spyOn(links, 'reschedule');
        await user.click(confirm);

        expect(
            await screen.findByText('Your appointment is moved'),
        ).toBeInTheDocument();
        expect(move).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/^Wed 28 October, /)).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to my appointment' }),
        ).toHaveAttribute('href', '/p/sample-booked');
    });

    it('clears the chosen time when another day is picked', async () => {
        const user = userEvent.setup();
        await open('sample-booked');

        await user.click(
            within(days()).getByRole('button', {
                name: 'Wednesday 28 October',
            }),
        );
        await user.click(within(times()).getAllByRole('button')[0]);
        await user.click(
            within(days()).getByRole('button', { name: 'Thursday 29 October' }),
        );

        expect(
            screen.getByRole('button', { name: 'Choose a time' }),
        ).toBeDisabled();
    });

    it('sends a request when the clinic approves time changes, and says the original stays', async () => {
        const user = userEvent.setup();
        await open('sample-approval');

        expect(
            screen.getByText(
                'This clinic approves time changes. You will get a message once the doctor replies.',
            ),
        ).toBeInTheDocument();
        await user.click(within(times()).getAllByRole('button')[0]);
        await user.click(screen.getByRole('button', { name: 'Send request' }));

        expect(await screen.findByText('Request sent')).toBeInTheDocument();
        expect(
            screen.getByText(
                'The clinic will reply by message. Your original time stays until then.',
            ),
        ).toBeInTheDocument();
    });

    it('says the time was just taken, refreshes the times and keeps the day', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-booked');
        vi.spyOn(links, 'reschedule').mockRejectedValue(
            new DataError('SLOT_UNAVAILABLE', 'taken'),
        );
        const view = vi.spyOn(links.views, 'reschedule');

        await user.click(within(times()).getAllByRole('button')[0]);
        await user.click(
            screen.getByRole('button', { name: 'Confirm new time' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'That time was just taken. Choose another.',
        );
        await waitFor(() => expect(view).toHaveBeenCalled());
        expect(
            screen.getByRole('button', { name: 'Choose a time' }),
        ).toBeDisabled();
        expect(
            screen.queryByText('Your appointment is moved'),
        ).not.toBeInTheDocument();
    });

    it('says when there are no free times at all and offers a call', async () => {
        const { links } = await open('sample-booked');
        const view = await links.views.reschedule('sample-booked');
        const empty = {
            ...view,
            days:
                view.state === 'valid'
                    ? view.days.map((d) => ({ ...d, slots: [] }))
                    : [],
        };
        vi.spyOn(links.views, 'reschedule').mockResolvedValue(empty);
        // A fresh render with that answer.
        document.body.innerHTML = '';
        page.token = 'sample-booked';
        renderPatient(<Reschedule />, { links });

        expect(
            await screen.findByText(
                'There are no free times in the next 14 days. Please call the clinic.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Call the clinic/ }),
        ).toHaveAttribute('href', 'tel:+922135001122');
    });

    it('says a visit that is too late or has a request waiting cannot be changed here', async () => {
        await open('sample-late');
        expect(
            screen.getByText('This visit cannot be changed online'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Please call the clinic to move your visit.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Day' })).toBeNull();
    });

    it('explains a waiting request', async () => {
        await open('sample-pending');

        expect(
            screen.getByText(/Your request is with the clinic/),
        ).toBeInTheDocument();
    });

    it('shows the expired page in place', async () => {
        await open('sample-expired');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'This link has expired',
            }),
        ).toBeInTheDocument();
    });

    it('reads in Urdu with the arrow flipped and the same days', async () => {
        await open('sample-booked', { locale: 'ur' });

        expect(
            screen.getByRole('heading', { level: 1, name: 'نیا وقت چنیں' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'دن' })).toBeInTheDocument();
        expect(
            within(screen.getByRole('group', { name: 'دن' })).getAllByRole(
                'button',
            ),
        ).toHaveLength(14);
    });
});
