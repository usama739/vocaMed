import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data';
import { freezeClock } from '@/test/reception';
import { patientSource, renderPatient } from '@/test/patient';
import Manage from './manage';

const page = vi.hoisted(() => ({ token: 'sample-booked' }));

// The page head and the route's props need a running Inertia app; the tests supply them.
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
    const result = renderPatient(<Manage />, options);
    await screen.findByRole('heading', { level: 1 });

    return result;
};

describe('Manage appointment', () => {
    it('greets the patient by first name and shows only this appointment', async () => {
        await open('sample-booked');

        expect(
            screen.getByRole('heading', { level: 1, name: 'Hello Bilqees' }),
        ).toBeInTheDocument();
        const card = screen.getByRole('region', {
            name: 'Appointment details',
        });
        expect(within(card).getByText('Dr. Imran Qureshi')).toBeInTheDocument();
        expect(
            within(card).getByText(/Follow-up visit · 10 min/),
        ).toBeInTheDocument();
        expect(
            within(card).getByText('Tue 27 October, 11:00'),
        ).toBeInTheDocument();
        expect(
            within(card).getByText('14 Khayaban-e-Iqbal, Clifton, Karachi'),
        ).toBeInTheDocument();
        expect(within(card).getByText('Booked')).toBeInTheDocument();
        // Nothing that names the patient further, or another patient.
        expect(document.body.textContent).not.toContain('Bano');
        expect(document.body.textContent).not.toContain('Zainab');
    });

    it('opens maps in a new tab without leaking the link', async () => {
        await open('sample-booked');

        const maps = screen.getByRole('link', { name: 'Open in maps' });
        expect(maps).toHaveAttribute('target', '_blank');
        expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
        expect(maps.getAttribute('href')).toContain(
            'query=14%20Khayaban-e-Iqbal',
        );
    });

    it('offers all three actions and the cancellation policy for a booked visit', async () => {
        await open('sample-booked');

        expect(
            screen.getByRole('button', { name: 'Confirm appointment' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('link', { name: 'Reschedule' }),
        ).toHaveAttribute('href', '/p/sample-booked/reschedule');
        expect(
            screen.getByRole('button', { name: 'Cancel appointment' }),
        ).toBeEnabled();
        expect(
            screen.getByText(
                'Free cancellation until 4 hours before your visit.',
            ),
        ).toBeInTheDocument();
    });

    it('confirms and says so', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-booked');
        const confirm = vi.spyOn(links, 'confirm');

        await user.click(
            screen.getByRole('button', { name: 'Confirm appointment' }),
        );

        expect(
            await screen.findByText('Thank you, you are confirmed'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('See you on Tuesday at 11:00.'),
        ).toBeInTheDocument();
        expect(confirm).toHaveBeenCalledWith('sample-booked');
        const done = await screen.findByRole('button', { name: /Confirmed/ });
        expect(done).toBeDisabled();
        expect(done).toHaveTextContent('✓ Confirmed');
    });

    it('shows an already confirmed visit without a thank-you banner', async () => {
        await open('sample-confirmed');

        expect(
            screen.getByRole('button', { name: /Confirmed/ }),
        ).toBeDisabled();
        expect(screen.queryByText('Thank you, you are confirmed')).toBeNull();
        expect(
            screen.getByRole('link', { name: 'Reschedule' }),
        ).toBeInTheDocument();
    });

    it('asks before cancelling, starting on the safe choice, and keeps the visit on "No"', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-booked');
        const cancel = vi.spyOn(links, 'cancel');

        await user.click(
            screen.getByRole('button', { name: 'Cancel appointment' }),
        );

        const sheet = await screen.findByRole('alertdialog');
        expect(
            within(sheet).getByText('Cancel your appointment?'),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(sheet).getByRole('button', { name: 'No, keep it' }),
            ).toHaveFocus(),
        );

        await user.click(
            within(sheet).getByRole('button', { name: 'No, keep it' }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect(cancel).not.toHaveBeenCalled();
    });

    it('cancels after "Yes, cancel", shows the red banner and takes the actions away', async () => {
        const user = userEvent.setup();
        await open('sample-booked');

        await user.click(
            screen.getByRole('button', { name: 'Cancel appointment' }),
        );
        await user.click(
            await screen.findByRole('button', { name: 'Yes, cancel' }),
        );

        expect(
            await screen.findByText('Your appointment is cancelled'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/The clinic has been told\. Call/),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Cancel appointment' }),
            ).toBeNull(),
        );
        expect(screen.queryByRole('link', { name: 'Reschedule' })).toBeNull();
        expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    it('shows a cancelled visit with no actions', async () => {
        await open('sample-cancelled');

        expect(
            screen.getByText('Your appointment is cancelled'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull();
        expect(screen.queryByRole('link', { name: 'Reschedule' })).toBeNull();
    });

    it('says it is too late to change online, offers a call, and still allows confirming', async () => {
        await open('sample-late');

        expect(
            screen.getByText('It is too late to change this online'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Call the clinic/ }),
        ).toHaveAttribute('href', 'tel:+922135001122');
        expect(screen.queryByRole('link', { name: 'Reschedule' })).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Cancel appointment' }),
        ).toBeNull();
        expect(screen.queryByText(/Free cancellation until/)).toBeNull();
    });

    it('says a request is waiting and hides Reschedule but not Cancel', async () => {
        await open('sample-pending');

        expect(
            screen.getByText('Your request is with the clinic'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Reschedule' })).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Cancel appointment' }),
        ).toBeInTheDocument();
    });

    it('links to the queue on the day of the visit', async () => {
        await open('sample-notarrived');

        expect(
            screen.getByRole('link', { name: 'See your place in the queue' }),
        ).toHaveAttribute('href', '/p/sample-notarrived/status');
    });

    it('has no actions once the visit has happened', async () => {
        await open('sample-done');

        expect(screen.getByText('Your visit is complete')).toBeInTheDocument();
        // Only the language switch is left.
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(
            ['English', 'اردو'],
        );
    });

    it('shows the expired page in place for an old or unknown link', async () => {
        await open('sample-expired');
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'This link has expired',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Call the clinic/ }),
        ).toBeInTheDocument();
    });

    it('names no clinic and offers no phone for an unknown link', async () => {
        await open('sample-unknown');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'We could not open this link',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Call the clinic/ }),
        ).toBeNull();
        expect(screen.getByText('VocaMed')).toBeInTheDocument();
        expect(document.body.textContent).not.toContain('Shifa');
    });

    it('explains an action that was refused, and shows what the server says now', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-booked');
        vi.spyOn(links, 'confirm').mockRejectedValue(
            new DataError('OUTSIDE_WINDOW', 'late'),
        );

        await user.click(
            screen.getByRole('button', { name: 'Confirm appointment' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'It is too late to change this online. Please call the clinic.',
        );
        expect(screen.queryByText('Thank you, you are confirmed')).toBeNull();
    });

    it('reads in Urdu, mirrored, with the same facts', async () => {
        await open('sample-booked', { locale: 'ur' });

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'السلام علیکم Bilqees',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'اپائنٹمنٹ کی تصدیق کریں' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('ملاقات سے 4 گھنٹے پہلے تک مفت منسوخی۔'),
        ).toBeInTheDocument();
    });

    it('shows loading, an error with retry, on request', async () => {
        window.history.replaceState({}, '', '/?state=loading');
        page.token = 'sample-booked';
        const { unmount } = renderPatient(<Manage />);
        expect(
            await screen.findByRole('status', {
                name: 'Loading your appointment',
            }),
        ).toBeInTheDocument();
        unmount();

        window.history.replaceState({}, '', '/?state=error');
        renderPatient(<Manage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
    });

    it('works from a source of its own, never the staff one', async () => {
        const { links } = patientSource();
        const spy = vi.spyOn(links.views, 'manage');
        page.token = 'sample-booked';
        renderPatient(<Manage />, { links });
        await screen.findByRole('heading', { level: 1 });

        expect(spy).toHaveBeenCalledWith('sample-booked');
    });
});
