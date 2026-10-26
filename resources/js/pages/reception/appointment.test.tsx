import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { freezeClock, renderReception } from '@/test/reception';
import AppointmentDetail from './appointment';

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

const open = async (id: string, options = {}) => {
    const result = renderReception(<AppointmentDetail id={id} />, options);
    await screen.findByRole('heading', { level: 1, name: 'Appointment' });

    return result;
};

describe('Appointment detail', () => {
    it('shows who, what, when and who booked it', async () => {
        await open('a_004');

        const facts = screen
            .getByRole('heading', { name: 'Details' })
            .closest('section') as HTMLElement;

        expect(within(facts).getByText('Zainab Hussain')).toBeInTheDocument();
        expect(within(facts).getByText('Dr. Sana Malik')).toBeInTheDocument();
        expect(
            within(facts).getByText(/General consultation/),
        ).toBeInTheDocument();
        expect(
            within(facts).getByText(/Monday, 26 October/),
        ).toBeInTheDocument();
        expect(within(facts).getByText('SMS')).toBeInTheDocument();
        expect(
            within(facts).getByText('Bilal Ahmed (voice)'),
        ).toBeInTheDocument();
        expect(
            within(facts).getByRole('link', { name: 'Open patient profile' }),
        ).toHaveAttribute('href', '/reception/patients/p_4');
        expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });

    it('shows the change history and the message timeline', async () => {
        await open('a_004');

        const history = screen
            .getByRole('heading', { name: 'Change history' })
            .closest('section') as HTMLElement;
        expect(
            within(history).getByText('Patient confirmed'),
        ).toBeInTheDocument();
        expect(
            within(history).getByText('Booking created by voice'),
        ).toBeInTheDocument();

        const timeline = screen
            .getByRole('heading', { name: 'Reminders and patient replies' })
            .closest('section') as HTMLElement;
        expect(
            within(timeline).getByText('Confirmation sent'),
        ).toBeInTheDocument();
        expect(
            within(timeline).getByText('Patient replied: Confirm'),
        ).toBeInTheDocument();
        expect(within(timeline).getByText('Reminder sent')).toBeInTheDocument();
    });

    it('marks the patient as arrived and removes the actions that no longer apply', async () => {
        const user = userEvent.setup();
        const { source } = await open('a_004');

        await user.click(screen.getByRole('button', { name: 'Mark arrived' }));

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Marked as arrived.',
            ),
        );
        expect((await source.appointments.get('a_004')).status).toBe('arrived');
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Mark arrived' }),
            ).not.toBeInTheDocument(),
        );
        expect(screen.getByText('Marked as arrived')).toBeInTheDocument();
    });

    it('queues the confirmation again and shows it in the timeline', async () => {
        const user = userEvent.setup();
        const { source } = await open('a_004');
        const before = (await source.appointments.timeline('a_004')).length;

        await user.click(
            screen.getByRole('button', { name: 'Resend confirmation' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Confirmation message queued.',
            ),
        );
        expect((await source.appointments.timeline('a_004')).length).toBe(
            before + 1,
        );
        expect(await screen.findByText(/SMS, queued/)).toBeInTheDocument();
    });

    it('cancels only after confirming', async () => {
        const user = userEvent.setup();
        const { source } = await open('a_004');

        await user.click(
            screen.getByRole('button', { name: 'Cancel appointment' }),
        );
        const dialog = await screen.findByRole('alertdialog');
        expect(
            within(dialog).getByRole('button', { name: 'Keep appointment' }),
        ).toHaveFocus();
        await user.click(
            within(dialog).getByRole('button', { name: 'Yes, cancel it' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Appointment cancelled. The patient was notified.',
            ),
        );
        expect((await source.appointments.get('a_004')).status).toBe(
            'cancelled',
        );
    });

    it('opens the panel to reschedule', async () => {
        const user = userEvent.setup();
        const { runtime } = await open('a_004');

        await user.click(screen.getByRole('button', { name: 'Reschedule' }));

        expect(runtime.openReschedule).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a_004' }),
        );
    });

    it('offers no actions once the appointment is finished', async () => {
        await open('a_001');

        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Reschedule' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Cancel appointment' }),
        ).not.toBeInTheDocument();
    });

    it('says so when the appointment does not exist', async () => {
        renderReception(<AppointmentDetail id="a_999" />);

        expect(
            await screen.findByText('Appointment not found'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to the list' }),
        ).toHaveAttribute('href', '/reception/appointments');
    });

    it('runs in Urdu, with the phone number and times left to right', async () => {
        renderReception(<AppointmentDetail id="a_004" />, { locale: 'ur' });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('اپائنٹمنٹ');
        expect(
            (await screen.findByText('0345 1234570')).closest('[dir="ltr"]'),
        ).toBeTruthy();
    });
});
