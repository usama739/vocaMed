import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { freezeClock, renderReception } from '@/test/reception';
import PatientProfile from './patient';

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

const open = async (id = 'p_4') => {
    const result = renderReception(<PatientProfile id={id} />);
    await screen.findByRole('heading', { level: 1 });

    return result;
};

describe('Patient profile', () => {
    it('shows the contact details, preferences and summary', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Zainab Hussain' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Phone')).toHaveValue('0345 1234570');
        expect(
            within(
                screen.getByRole('group', { name: 'Message language' }),
            ).getByRole('button', { name: 'Urdu' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(
                screen.getByRole('group', { name: 'Reminder channel' }),
            ).getByRole('button', { name: 'SMS' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('checkbox', {
                name: /Agrees to receive appointment messages/,
            }),
        ).toBeChecked();
        expect(
            screen.getByText('Do not record medical details here.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Summary' })).toBeVisible();
    });

    it('lists upcoming and past appointments as links to each one', async () => {
        await open();

        const upcoming = screen
            .getByRole('heading', { name: 'Upcoming' })
            .closest('section') as HTMLElement;
        const link = within(upcoming).getByRole('link', {
            name: /Today, 10:30/,
        });

        expect(link).toHaveAttribute('href', '/reception/appointments/a_004');
        expect(within(upcoming).getByText('Confirmed')).toBeInTheDocument();

        const past = screen
            .getByRole('heading', { name: 'Past appointments' })
            .closest('section') as HTMLElement;
        expect(within(past).getByText('Cancelled')).toBeInTheDocument();
    });

    it('keeps Save off until something changes, then saves and says so', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const save = screen.getByRole('button', { name: 'Save changes' });

        expect(save).toBeDisabled();
        await user.type(
            screen.getByLabelText('Notes (non-clinical)'),
            'Comes with her mother',
        );

        expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();
        expect(save).toBeEnabled();

        await user.click(save);

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Patient details saved.',
            ),
        );
        expect((await source.patients.get('p_4')).notes).toBe(
            'Comes with her mother',
        );
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save changes' }),
            ).toBeDisabled(),
        );
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    });

    it('changes the consent explanation at once and saves it', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        expect(
            screen.getByText('Reminders and confirmations will be sent.'),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('checkbox', {
                name: /Agrees to receive appointment messages/,
            }),
        );

        expect(
            await screen.findByText(
                'No messages will be sent. Remind the patient by phone.',
            ),
        ).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(async () =>
            expect((await source.patients.get('p_4')).consent).toBe(false),
        );
    });

    it('rejects a phone number that is too short', async () => {
        const user = userEvent.setup();
        await open();
        const phone = screen.getByLabelText('Phone');

        await user.clear(phone);
        await user.type(phone, '0300 12');
        await user.click(screen.getByRole('button', { name: 'Save changes' }));

        expect(
            await screen.findByText(/at least 10 digits/),
        ).toBeInTheDocument();
        expect(notify).not.toHaveBeenCalled();
    });

    it('opens the booking panel with this patient already chosen', async () => {
        const user = userEvent.setup();
        const { runtime } = await open();

        await user.click(
            screen.getAllByRole('button', { name: 'Book appointment' })[0],
        );

        expect(runtime.openBooking).toHaveBeenCalledWith({
            patient: expect.objectContaining({ id: 'p_4' }),
        });
    });

    it('says when a patient has no phone number on file', async () => {
        const { source } = renderReception(<PatientProfile id="p_4" />);
        const created = await source.patients.create({
            name: 'Walk-in guest',
            phone: '',
            noPhone: true,
        });
        renderReception(<PatientProfile id={created.id} />, { source });

        expect(
            await screen.findByText(
                'No phone number on file: messages cannot be sent.',
            ),
        ).toBeInTheDocument();
    });

    it('says so when the patient does not exist', async () => {
        renderReception(<PatientProfile id="p_999" />);

        expect(
            await screen.findByText('Patient not found'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to the list' }),
        ).toHaveAttribute('href', '/reception/patients');
    });
});
