import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeClock, MONDAY_MORNING } from '@/test/reception';
import { renderPatient } from '@/test/patient';
import Status from './status';

const page = vi.hoisted(() => ({ token: 'sample-waiting' }));

vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
    usePage: () => ({ props: { token: page.token } }),
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState({}, '', '/');
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (token: string, options = {}) => {
    page.token = token;
    const result = renderPatient(<Status />, options);
    await screen.findByText('Your appointment');

    return result;
};

describe('Queue status', () => {
    it('shows someone checked in behind the patient in the consulting room', async () => {
        await open('sample-waiting');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Your place in the queue',
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Please wait')).toBeInTheDocument();
        expect(
            screen.getByText('Patients ahead of you').previousElementSibling,
        ).toHaveTextContent('1');
        expect(
            screen.getByText('Estimated wait').previousElementSibling,
        ).toHaveTextContent('20 min');
        expect(
            screen.getByText('The wait is an estimate and can change.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Dr. Sana Malik · today, 10:00'),
        ).toBeInTheDocument();
        expect(screen.getByText('Updated just now')).toBeInTheDocument();
    });

    it('says "You are next" with no wait', async () => {
        await open('sample-next');

        expect(screen.getByText('You are next')).toBeInTheDocument();
        expect(
            screen.getByText('Patients ahead of you').previousElementSibling,
        ).toHaveTextContent('0');
        expect(
            screen.getByText('Estimated wait').previousElementSibling,
        ).toHaveTextContent('Any moment');
    });

    it('has no counts while the consultation is on, or once it is done', async () => {
        await open('sample-consult');
        expect(
            screen.getByText('Your consultation is in progress'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Patients ahead of you')).toBeNull();
    });

    it('says the visit is complete', async () => {
        await open('sample-done');

        expect(screen.getByText('Your visit is complete')).toBeInTheDocument();
        expect(screen.queryByText('Estimated wait')).toBeNull();
    });

    it('asks a patient who has not checked in to tell reception', async () => {
        await open('sample-notarrived');

        expect(
            screen.getByText('You have not checked in yet'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Tell reception when you arrive. The queue starts once you are checked in.',
            ),
        ).toBeInTheDocument();
    });

    it('says the queue opens on the day of the visit', async () => {
        await open('sample-booked');

        expect(
            screen.getByText('The queue opens on the day of your appointment'),
        ).toBeInTheDocument();
    });

    it('announces its status politely and links back to the appointment', async () => {
        await open('sample-waiting');

        expect(
            screen.getByText('Please wait').closest('section'),
        ).toHaveAttribute('aria-live', 'polite');
        expect(
            screen.getByRole('link', { name: 'Back to my appointment' }),
        ).toHaveAttribute('href', '/p/sample-waiting');
    });

    it('asks again every ten seconds and counts the seconds in between', async () => {
        vi.useRealTimers();
        vi.useFakeTimers({
            toFake: ['Date', 'setInterval', 'clearInterval'],
        });
        vi.setSystemTime(MONDAY_MORNING);
        page.token = 'sample-waiting';
        const { links } = renderPatient(<Status />);
        const spy = vi.spyOn(links.views, 'status');
        await screen.findByText('Your appointment');

        await vi.advanceTimersByTimeAsync(4_000);
        expect(screen.getByText('Updated 4 seconds ago')).toBeInTheDocument();

        await vi.advanceTimersByTimeAsync(7_000);
        await waitFor(() => expect(spy).toHaveBeenCalled());
        // A fresh answer starts the count again.
        await waitFor(() =>
            expect(
                screen.getByText(/^Updated (just now|1 second ago)$/),
            ).toBeInTheDocument(),
        );
    });

    it('says updates are paused when the connection drops, and keeps the page', async () => {
        window.history.replaceState({}, '', '/?state=reconnecting');
        await open('sample-waiting');

        expect(
            screen.getByText('Updates paused. Reconnecting…'),
        ).toBeInTheDocument();
        expect(screen.getByText('Please wait')).toBeInTheDocument();
    });

    it('shows the expired page in place', async () => {
        page.token = 'sample-expired';
        renderPatient(<Status />);

        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'This link has expired',
            }),
        ).toBeInTheDocument();
    });

    it('reads in Urdu', async () => {
        page.token = 'sample-waiting';
        renderPatient(<Status />, { locale: 'ur' });

        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'قطار میں آپ کی باری',
            }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText('براہِ کرم انتظار کریں'),
        ).toBeInTheDocument();
    });
});
