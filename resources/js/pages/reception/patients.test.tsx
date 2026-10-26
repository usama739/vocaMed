import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { freezeClock, renderReception } from '@/test/reception';
import Patients from './patients';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/reception/patients');
    vi.mocked(notify).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const table = () => screen.findByRole('table', { name: 'Patients' });

describe('Patients', () => {
    it('lists recent patients with their last visit and next appointment', async () => {
        const { source } = renderReception(<Patients />);
        const [first] = await source.patients.recent(8);
        const rows = within(await table()).getAllByRole('row');

        expect(
            screen.getByRole('heading', { level: 2, name: 'Recent patients' }),
        ).toBeInTheDocument();
        expect(rows.length).toBeGreaterThan(3);
        expect(
            await within(await table()).findByText(first.name),
        ).toBeInTheDocument();
        // Phone numbers are shown the way the clinic dials them, always left to right.
        const national = `0${first.phone.slice(3, 6)} ${first.phone.slice(6, 7)}`;
        expect(
            within(await table())
                .getByText(new RegExp(`^${national}`))
                .closest('[dir="ltr"]'),
        ).toBeTruthy();
    });

    it('searches by phone first and keeps the search in the address', async () => {
        const user = userEvent.setup();
        renderReception(<Patients />);
        await table();

        await user.type(
            screen.getByRole('searchbox', { name: 'Search by phone or name' }),
            '0345 1112266',
        );

        await waitFor(() =>
            expect(
                screen.getByRole('heading', {
                    level: 2,
                    name: 'Search results',
                }),
            ).toBeInTheDocument(),
        );
        await waitFor(async () => {
            const rows = within(await table()).getAllByRole('row');

            expect(rows).toHaveLength(2);
        });
        expect(
            within(await table()).getByText('Nida Kamal'),
        ).toBeInTheDocument();
        expect(window.location.search).toContain('q=');
    });

    it('offers to add the patient when nobody matches, with the typed number filled in', async () => {
        const user = userEvent.setup();
        renderReception(<Patients />);
        await table();

        await user.type(
            screen.getByRole('searchbox', { name: 'Search by phone or name' }),
            '0399 8887766',
        );

        expect(await screen.findByText('No patient found')).toBeInTheDocument();
        // The header has one too; the empty state's sits last.
        await user.click(
            screen.getAllByRole('button', { name: 'New patient' }).at(-1)!,
        );

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByLabelText('Mobile phone')).toHaveValue(
            '0399 8887766',
        );
    });

    it('adds a patient from the dialog, then lists them first', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Patients />);
        await table();

        await user.click(
            screen.getAllByRole('button', { name: 'New patient' })[0],
        );
        const dialog = await screen.findByRole('dialog');
        await user.type(
            within(dialog).getByLabelText('Full name'),
            'Sara Khan',
        );
        await user.type(
            within(dialog).getByLabelText('Mobile phone'),
            '0300 5551234',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save patient' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Sara Khan added.'),
        );
        const rows = within(await table()).getAllByRole('row');
        expect(within(rows[1]).getByText('Sara Khan')).toBeInTheDocument();
        expect((await source.patients.search('0300 5551234'))[0].phone).toBe(
            '+923005551234',
        );
    });

    it('tells the receptionist what is wrong in the dialog', async () => {
        const user = userEvent.setup();
        renderReception(<Patients />);
        await table();

        await user.click(
            screen.getAllByRole('button', { name: 'New patient' })[0],
        );
        const dialog = await screen.findByRole('dialog');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save patient' }),
        );

        expect(
            await within(dialog).findByText('Enter the patient’s name.'),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(/at least 10 digits/),
        ).toBeInTheDocument();
    });

    it('refuses a phone number that already belongs to a patient', async () => {
        const user = userEvent.setup();
        renderReception(<Patients />);
        await table();

        await user.click(
            screen.getAllByRole('button', { name: 'New patient' })[0],
        );
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText('Full name'), 'Someone');
        await user.type(
            within(dialog).getByLabelText('Mobile phone'),
            '0345 1234570',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save patient' }),
        );

        expect(
            await within(dialog).findByText(
                'A patient with this phone number already exists.',
            ),
        ).toBeInTheDocument();
    });

    it('focuses the search with the slash key', async () => {
        const user = userEvent.setup();
        renderReception(<Patients />);
        await table();

        await user.keyboard('/');

        expect(
            screen.getByRole('searchbox', { name: 'Search by phone or name' }),
        ).toHaveFocus();
    });

    it('runs in Urdu, mirrored, with Urdu names intact', async () => {
        const { container } = renderReception(<Patients />, { locale: 'ur' });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('مریض');
        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
        await waitFor(() =>
            expect(screen.getAllByText('بشیر احمد').length).toBeGreaterThan(0),
        );
    });
});
