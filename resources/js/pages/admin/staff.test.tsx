import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Staff from './staff';

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

const open = async (actor = 'u_admin', locale: 'en' | 'ur' = 'en') => {
    const { db, source } = receptionSource(actor);
    const result = renderReception(<Staff />, { source, locale });
    await screen.findByRole('table');

    return { ...result, db, source };
};

const row = (id: string) =>
    document.querySelector(`[data-staff="${id}"]`) as HTMLElement;

describe('Admin staff', () => {
    it('lists the team with a status pill each, and "This is you" on your own row', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Staff' }),
        ).toBeInTheDocument();

        const me = row('u_admin');

        expect(within(me).getByText('Ayesha Khan')).toBeInTheDocument();
        expect(within(me).getByText('Clinic admin')).toBeInTheDocument();
        expect(within(me).getByText('Active')).toBeInTheDocument();
        expect(within(me).getByText('This is you')).toBeInTheDocument();
        // Nobody can deactivate themselves: the server sends no such action.
        expect(
            within(me).queryByRole('button', { name: /Deactivate/ }),
        ).toBeNull();

        const pending = row('inv_1');

        expect(within(pending).getByText('Invitation pending')).toBeVisible();
        expect(within(pending).getByText('Invited')).toBeInTheDocument();
        expect(
            within(pending).getByRole('button', { name: /Resend invite/ }),
        ).toBeInTheDocument();

        expect(within(row('inv_2')).getByText('Expired')).toBeInTheDocument();
        expect(
            within(row('inv_2')).getByRole('button', {
                name: /Resend invite/,
            }),
        ).toBeInTheDocument();

        expect(within(row('u_recep3')).getByText('Deactivated')).toBeVisible();
        expect(
            within(row('u_recep3')).getByRole('button', {
                name: 'Reactivate Kamran Ali',
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByText('Doctors are managed on the Doctors page.'),
        ).toBeInTheDocument();
        // Doctors are not staff.
        expect(screen.queryByText('Dr. Sana Malik')).toBeNull();
    });

    it('invites by email with a role, and shows the new row', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(screen.getByRole('button', { name: 'Invite staff' }));
        const dialog = await screen.findByRole('dialog');

        expect(
            within(dialog).getByRole('radio', { name: 'Receptionist' }),
        ).toBeChecked();
        await user.type(
            within(dialog).getByLabelText('Email'),
            'new.admin@shifa.example',
        );
        await user.click(
            within(dialog).getByRole('radio', { name: 'Clinic admin' }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Send invitation' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Invitation sent to new.admin@shifa.example',
            ),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        const view = await source.views.adminStaff();
        const added = view.rows.find(
            (r) => r.email === 'new.admin@shifa.example',
        );

        expect(added).toMatchObject({
            role: 'clinic_admin',
            status: 'invited',
        });
        await waitFor(() =>
            expect(
                screen.getByText('new.admin@shifa.example'),
            ).toBeInTheDocument(),
        );
    });

    it('says when the email is not valid or already in use, and keeps the dialog open', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Invite staff' }));
        const dialog = await screen.findByRole('dialog');
        const email = within(dialog).getByLabelText('Email');
        const send = within(dialog).getByRole('button', {
            name: 'Send invitation',
        });

        await user.type(email, 'not-an-email');
        await user.click(send);
        expect(
            await within(dialog).findByText('Enter a valid email address.'),
        ).toBeInTheDocument();
        expect(email).toHaveAttribute('aria-invalid', 'true');

        await user.clear(email);
        await user.type(email, 'bilal@shifa.example');
        await user.click(send);
        expect(
            await within(dialog).findByText('That email is already in use.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(notify).not.toHaveBeenCalled();
    });

    it('resends an invitation, including one that has expired', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            within(row('inv_2')).getByRole('button', {
                name: 'Resend invite to weekend.desk@shifa.example',
            }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Invitation resent to weekend.desk@shifa.example',
            ),
        );
        const view = await source.views.adminStaff();

        expect(view.rows.find((r) => r.id === 'inv_2')?.status).toBe('invited');
    });

    it('asks before revoking, then removes the invitation', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            within(row('inv_1')).getByRole('button', {
                name: 'Revoke invite to newdesk@shifa.example',
            }),
        );
        const dialog = await screen.findByRole('alertdialog');

        expect(
            within(dialog).getByText('Revoke this invitation?'),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                'The link sent to newdesk@shifa.example will stop working.',
            ),
        ).toBeInTheDocument();

        await user.click(
            within(dialog).getByRole('button', { name: 'Revoke invite' }),
        );
        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Invitation revoked.',
            ),
        );
        expect(
            (await source.views.adminStaff()).rows.some(
                (r) => r.id === 'inv_1',
            ),
        ).toBe(false);
        await waitFor(() => expect(row('inv_1')).toBeNull());
    });

    it('keeps the person when the confirm is cancelled', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            screen.getByRole('button', { name: 'Deactivate Bilal Ahmed' }),
        );
        const dialog = await screen.findByRole('alertdialog');

        expect(
            within(dialog).getByText('Deactivate Bilal Ahmed?'),
        ).toBeInTheDocument();
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect(
            (await source.views.adminStaff()).rows.find(
                (r) => r.id === 'u_recep',
            )?.status,
        ).toBe('active');
    });

    it('deactivates, then reactivates', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            screen.getByRole('button', { name: 'Deactivate Hira Nawaz' }),
        );
        await user.click(
            await within(await screen.findByRole('alertdialog')).findByRole(
                'button',
                { name: 'Deactivate' },
            ),
        );
        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'User deactivated.'),
        );
        expect(
            (await source.views.adminStaff()).rows.find(
                (r) => r.id === 'u_recep2',
            )?.status,
        ).toBe('deactivated');

        await user.click(
            await screen.findByRole('button', {
                name: 'Reactivate Hira Nawaz',
            }),
        );
        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'User reactivated.'),
        );
        expect(
            (await source.views.adminStaff()).rows.find(
                (r) => r.id === 'u_recep2',
            )?.status,
        ).toBe('active');
    });

    it('shows a server refusal as an error toast and leaves the row alone', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        // Another admin deactivated the other admin meanwhile: the last admin cannot go.
        vi.spyOn(source.staff, 'setActive').mockRejectedValueOnce(
            Object.assign(new Error('last'), {
                name: 'DataError',
                code: 'LAST_ADMIN',
                field: null,
                alternatives: [],
                detail: null,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Deactivate Bilal Ahmed' }),
        );
        await user.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Deactivate',
            }),
        );

        await waitFor(() => expect(notify).toHaveBeenCalled());
        expect(row('u_recep')).not.toBeNull();
    });

    it('refuses everyone but the clinic admin', async () => {
        const { source } = receptionSource('u_recep');

        await expect(source.views.adminStaff()).rejects.toMatchObject({
            code: 'FORBIDDEN',
        });
    });

    it.each([
        ['loading', 'status'],
        ['error', 'alert'],
    ] as const)('shows the %s state on request', async (forced, role) => {
        const { source } = receptionSource('u_admin');
        renderReception(<Staff />, { source, forced });

        expect(
            await screen.findByRole(
                role,
                role === 'status' ? { name: 'Loading staff' } : undefined,
            ),
        ).toBeInTheDocument();
    });

    it('shows an empty state with the invite action', async () => {
        const { source } = receptionSource('u_admin');
        renderReception(<Staff />, { source, forced: 'empty' });

        expect(
            await screen.findByText('No team members yet'),
        ).toBeInTheDocument();
        expect(
            screen.getAllByRole('button', { name: 'Invite staff' }),
        ).toHaveLength(2);
    });

    it('works in Urdu', async () => {
        await open('u_admin', 'ur');

        expect(
            screen.getByRole('heading', { level: 1, name: 'عملہ' }),
        ).toBeInTheDocument();
        expect(
            within(row('u_admin')).getByText('یہ آپ ہیں'),
        ).toBeInTheDocument();
        expect(within(row('inv_2')).getByText('میعاد ختم')).toBeInTheDocument();
    });
});
