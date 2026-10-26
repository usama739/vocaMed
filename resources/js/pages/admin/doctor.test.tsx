import { router } from '@inertiajs/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import DoctorProfile from './doctor';

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
    vi.restoreAllMocks();
});

const open = async (id: string, options: { locale?: 'en' | 'ur' } = {}) => {
    const source = receptionSource('u_admin').source;
    const result = renderReception(<DoctorProfile id={id} />, {
        source,
        ...options,
    });
    await waitFor(() =>
        expect(screen.getAllByRole('switch').length).toBeGreaterThan(7),
    );

    return { ...result, source };
};

const preview = () => screen.getByRole('complementary');
const nameField = () => screen.getByRole('textbox', { name: 'Name' });

describe('Doctor profile', () => {
    it('shows the profile, services, availability and who the doctor signs in as', async () => {
        await open('d_sana');

        expect(
            screen.getByRole('heading', { level: 1, name: 'Dr. Sana Malik' }),
        ).toBeInTheDocument();
        expect(nameField()).toHaveValue('Dr. Sana Malik');
        expect(screen.getByRole('textbox', { name: 'Specialty' })).toHaveValue(
            'General Physician',
        );
        expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Punjabi' })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
        expect(
            screen.getByRole('checkbox', { name: /General consultation/ }),
        ).toBeChecked();
        expect(
            screen.getByRole('checkbox', { name: /Child check-up/ }),
        ).not.toBeChecked();
        expect(
            screen.getByRole('switch', { name: 'Accepting bookings' }),
        ).toBeChecked();
        expect(
            await within(preview()).findByText('13 slots'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Can sign in as sana@shifa.example.'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toBeDisabled();
    });

    it(
        'saves profile, services and availability in one request, and clears the unsaved note',
        { timeout: 60_000 },
        async () => {
            const user = userEvent.setup();
            const { source } = await open('d_sana');
            const save = vi.spyOn(source.doctors, 'save');

            await user.type(nameField(), ' II');
            await user.click(screen.getByRole('button', { name: 'Punjabi' }));
            await user.click(
                screen.getByRole('checkbox', { name: /Child check-up/ }),
            );
            await user.click(screen.getByRole('switch', { name: 'Saturday' }));

            expect(
                await screen.findAllByText('Unsaved changes'),
            ).not.toHaveLength(0);
            await user.click(screen.getByRole('button', { name: /^Save/ }));

            await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
            const [, input] = save.mock.calls[0];
            expect(input.profile).toMatchObject({
                name: 'Dr. Sana Malik II',
                languages: ['en', 'ur', 'pa'],
            });
            expect(input.profile.serviceIds).toContain('s_child');
            expect(
                input.availability.days.find((d) => d.weekday === 6)?.on,
            ).toBe(false);
            expect(notify).toHaveBeenCalledWith('success', 'Changes saved');
            await waitFor(() =>
                expect(screen.queryByText('Unsaved changes')).toBeNull(),
            );

            const stored = await source.doctors.get('d_sana');
            expect(stored.name).toBe('Dr. Sana Malik II');
            expect(stored.serviceIds).toContain('s_child');
        },
    );

    it(
        'stays clean once the saved record comes back, even with a day switched off',
        { timeout: 60_000 },
        async () => {
            const user = userEvent.setup();
            await open('d_sana');

            await user.click(screen.getByRole('switch', { name: 'Tuesday' }));
            await user.click(
                await screen.findByRole('button', { name: 'Save anyway' }),
            );
            await waitFor(() =>
                expect(notify).toHaveBeenCalledWith('success', 'Changes saved'),
            );
            // The reload returns the off day with default hours; that is not an edit.
            await new Promise((resolve) => setTimeout(resolve, 1200));

            expect(screen.queryByText('Unsaved changes')).toBeNull();
            expect(
                screen.getByRole('button', { name: 'Save changes' }),
            ).toBeDisabled();
        },
    );

    it('needs a name', async () => {
        const user = userEvent.setup();
        const { source } = await open('d_sana');
        const save = vi.spyOn(source.doctors, 'save');

        await user.clear(nameField());
        await user.click(screen.getByRole('button', { name: /^Save/ }));

        expect(
            await screen.findByText('Enter the doctor’s name.'),
        ).toBeInTheDocument();
        expect(save).not.toHaveBeenCalled();
    });

    it('updates the preview from the server and warns about the bookings a change affects', async () => {
        const user = userEvent.setup();
        await open('d_sana');
        const total = () =>
            within(preview()).getByRole('status').textContent ?? '';
        const before = total();

        await user.click(screen.getByRole('switch', { name: 'Tuesday' }));

        const warning = await screen.findByRole('alert', {}, { timeout: 4000 });
        expect(warning).toHaveTextContent(
            'This change affects existing bookings',
        );
        expect(total()).not.toBe(before);
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save anyway' }),
            ).toBeEnabled(),
        );
    });

    it('asks before taking a doctor with upcoming appointments off booking, and shows the note', async () => {
        const user = userEvent.setup();
        await open('d_sana');

        await user.click(
            screen.getByRole('switch', { name: 'Accepting bookings' }),
        );
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent(/stay on the calendar/);
        await user.click(
            within(dialog).getByRole('button', { name: 'Stop bookings' }),
        );

        const toggle = await screen.findByRole('switch', {
            name: 'Not accepting bookings',
        });
        expect(toggle).not.toBeChecked();
        expect(
            screen.getByText(/does not appear when booking/),
        ).toBeInTheDocument();
    });

    it('discards edits and goes back to the saved profile', async () => {
        const user = userEvent.setup();
        await open('d_sana');

        await user.type(nameField(), ' Jr');
        expect(nameField()).toHaveValue('Dr. Sana Malik Jr');
        await user.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );

        expect(nameField()).toHaveValue('Dr. Sana Malik');
    });

    it('asks before leaving with unsaved changes', async () => {
        const user = userEvent.setup();
        const handlers: ((event: { preventDefault: () => void }) => void)[] =
            [];
        vi.spyOn(router, 'on').mockImplementation(((
            name: string,
            handler: (event: { preventDefault: () => void }) => void,
        ) => {
            if (name === 'before') {
                handlers.push(handler);
            }

            return () => undefined;
        }) as never);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await open('d_sana');

        expect(handlers).toHaveLength(0);
        await user.type(nameField(), 'x');
        await waitFor(() => expect(handlers.length).toBeGreaterThan(0));

        const event = { preventDefault: vi.fn() };
        handlers.at(-1)?.(event);
        expect(confirm).toHaveBeenCalledWith(
            'You have unsaved changes. Leave this page and lose them?',
        );
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it(
        'adds a doctor: blank form, defaults, one request, then the saved page',
        { timeout: 60_000 },
        async () => {
            const user = userEvent.setup();
            const visit = vi
                .spyOn(router, 'visit')
                .mockImplementation(() => undefined);
            const { source } = await open('new');
            const create = vi.spyOn(source.doctors, 'create');

            expect(
                screen.getByRole('heading', { level: 1, name: 'Add doctor' }),
            ).toBeInTheDocument();
            expect(nameField()).toHaveValue('');
            expect(
                screen.getByRole('button', { name: 'English' }),
            ).toHaveAttribute('aria-pressed', 'true');
            expect(
                screen.getByRole('switch', { name: 'Monday' }),
            ).toBeChecked();
            expect(
                screen.getByRole('switch', { name: 'Saturday' }),
            ).not.toBeChecked();
            expect(
                screen.getByText(
                    'Save the doctor first, then invite them to sign in.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Add doctor' }),
            ).toBeDisabled();

            await user.type(nameField(), 'Dr. Zara Ahmed');
            await user.type(
                screen.getByRole('textbox', { name: 'Specialty' }),
                'ENT',
            );
            await user.click(
                screen.getByRole('button', { name: 'Add doctor' }),
            );

            await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(visit).toHaveBeenCalled());
            expect(notify).toHaveBeenCalledWith('success', 'Doctor added.');
            const created = (await source.doctors.list()).find(
                (d) => d.name === 'Dr. Zara Ahmed',
            );
            expect(created?.specialty).toBe('ENT');
            expect(visit).toHaveBeenCalledWith(
                `/admin/doctors/${created?.id}`,
                {
                    replace: true,
                },
            );
        },
    );

    it('says when a doctor does not exist', async () => {
        renderReception(<DoctorProfile id="d_missing" />, {
            source: receptionSource('u_admin').source,
        });

        expect(
            await screen.findByText('We could not find that'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to doctors' }),
        ).toHaveAttribute('href', '/admin/doctors');
    });

    describe('sign-in access', () => {
        it('invites a doctor, then offers resend and revoke', async () => {
            const user = userEvent.setup();
            const { source } = await open('d_hina');

            expect(screen.getByText('Not invited yet.')).toBeInTheDocument();
            await user.type(
                screen.getByRole('textbox', { name: 'Doctor’s email' }),
                'hina@shifa.example',
            );
            await user.click(
                screen.getByRole('button', { name: 'Invite to sign in' }),
            );

            expect(
                await screen.findByText(
                    'Invitation sent to hina@shifa.example.',
                    { selector: 'span' },
                ),
            ).toBeInTheDocument();
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Invitation sent to hina@shifa.example.',
            );

            await user.click(
                screen.getByRole('button', { name: 'Resend invite' }),
            );
            await waitFor(() =>
                expect(notify).toHaveBeenCalledWith(
                    'success',
                    'Invitation sent again to hina@shifa.example.',
                ),
            );

            await user.click(
                screen.getByRole('button', { name: 'Revoke invite' }),
            );
            expect(
                await screen.findByText('Not invited yet.'),
            ).toBeInTheDocument();
            const view = await source.views.adminDoctor({ doctorId: 'd_hina' });
            expect(view?.signIn.state).toBe('none');
        });

        it('rejects an email already in use and a malformed one', async () => {
            const user = userEvent.setup();
            await open('d_hina');
            const field = screen.getByRole('textbox', {
                name: 'Doctor’s email',
            });

            await user.type(field, 'nope');
            await user.click(
                screen.getByRole('button', { name: 'Invite to sign in' }),
            );
            expect(
                await screen.findByText('Enter a valid email address.'),
            ).toBeInTheDocument();

            await user.clear(field);
            await user.type(field, 'ayesha@shifa.example');
            await user.click(
                screen.getByRole('button', { name: 'Invite to sign in' }),
            );
            expect(
                await screen.findByText('That email is already in use.'),
            ).toBeInTheDocument();
        });
    });

    it('mirrors in Urdu', async () => {
        await open('d_sana', { locale: 'ur' });

        expect(
            screen.getByRole('button', { name: 'پنجابی' }),
        ).toBeInTheDocument();
        expect(screen.getByText('سائن اِن کی رسائی')).toBeInTheDocument();
    });
});
