import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { AccountSourceProvider } from '@/hooks/use-account';
import type { Locale } from '@/i18n/locales';
import { LocaleScope } from '@/i18n/scope';
import { SAMPLE_PASSWORD } from '@/lib/data/auth-mock';
import { DataError, type AccountSource } from '@/lib/data';
import { createMockAccounts } from '@/lib/data/mock-account';
import { createSeedDatabase } from '@/lib/data/seed';
import '@/test/render';
import Account from './account';

const setLocale = vi.hoisted(() => vi.fn());

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
vi.mock('@/hooks/use-locale', () => ({
    useLocale: () => ({
        locale: 'en',
        dir: 'ltr',
        isRtl: false,
        setLocale,
    }),
}));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    vi.mocked(notify).mockClear();
    setLocale.mockClear();
    window.history.replaceState({}, '', '/account');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const sourceFor = (userId = 'u_admin') =>
    createMockAccounts(createSeedDatabase(new Date()), {
        initialPassword: SAMPLE_PASSWORD,
    })(userId);

const open = async (
    options: { userId?: string; locale?: Locale; source?: AccountSource } = {},
) => {
    const source = options.source ?? sourceFor(options.userId);
    const user = userEvent.setup();
    const result = render(
        <LocaleScope locale={options.locale ?? 'en'}>
            <AccountSourceProvider source={source}>
                <Account />
            </AccountSourceProvider>
        </LocaleScope>,
    );
    await screen.findByRole('region', {
        name: options.locale === 'ur' ? 'پروفائل' : 'Profile',
    });

    return { ...result, source, user };
};

const card = (name: string) => screen.getByRole('region', { name });

describe('Account', () => {
    it('shows the title and the four cards', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Account' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Your own details. These apply only to you, not to the clinic.',
            ),
        ).toBeInTheDocument();
        for (const name of [
            'Profile',
            'Change password',
            'Notification preferences',
            'Sessions',
        ]) {
            expect(card(name)).toBeInTheDocument();
        }
    });

    it('shows the person’s own name and a read-only email with the right hint', async () => {
        await open({ userId: 'u_recep' });
        const profile = card('Profile');

        expect(within(profile).getByLabelText('Full name')).toHaveValue(
            'Bilal Ahmed',
        );
        const email = within(profile).getByLabelText('Email');
        expect(email).toHaveValue('bilal@shifa.example');
        expect(email).toHaveAttribute('readonly');
        expect(
            within(profile).getByText(
                'Your email is your sign-in. Ask a clinic admin to change it.',
            ),
        ).toBeInTheDocument();
    });

    it('tells the admin to contact VocaMed, since there is no admin to ask', async () => {
        await open({ userId: 'u_admin' });

        expect(
            screen.getByText(
                'Your email is your sign-in. Contact VocaMed to change it.',
            ),
        ).toBeInTheDocument();
    });
});

describe('Profile', () => {
    it('waits for an edit, saves the name and language, and says so', async () => {
        const { user, source } = await open();
        const save = vi.spyOn(source, 'saveProfile');
        const profile = card('Profile');
        const button = within(profile).getByRole('button', {
            name: 'Save profile',
        });
        expect(button).toBeDisabled();

        const name = within(profile).getByLabelText('Full name');
        await user.clear(name);
        await user.type(name, 'Ayesha K. Khan');
        expect(
            within(profile).getByText('Unsaved changes'),
        ).toBeInTheDocument();
        expect(button).toBeEnabled();

        await user.click(button);

        await waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                name: 'Ayesha K. Khan',
                locale: 'en',
            }),
        );
        expect(notify).toHaveBeenCalledWith('success', 'Profile saved');
        await waitFor(() =>
            expect(
                within(profile).queryByText('Unsaved changes'),
            ).not.toBeInTheDocument(),
        );
    });

    it('needs a name', async () => {
        const { user, source } = await open();
        const save = vi.spyOn(source, 'saveProfile');
        const profile = card('Profile');
        const name = within(profile).getByLabelText('Full name');

        await user.clear(name);
        await user.click(
            within(profile).getByRole('button', { name: 'Save profile' }),
        );

        expect(
            await within(profile).findByText('Enter your name.'),
        ).toBeInTheDocument();
        expect(save).not.toHaveBeenCalled();
    });

    it('switches the language at once when a radio is chosen', async () => {
        const { user } = await open();
        const profile = card('Profile');
        const language = within(profile).getByRole('group', {
            name: 'Language',
        });

        expect(
            within(language).getByRole('radio', { name: 'English' }),
        ).toBeChecked();
        await user.click(within(language).getByRole('radio', { name: 'اردو' }));

        expect(setLocale).toHaveBeenCalledWith('ur');
    });

    it('says when the save failed', async () => {
        const { user, source } = await open();
        vi.spyOn(source, 'saveProfile').mockRejectedValue(
            new DataError('FORBIDDEN', 'no'),
        );
        const profile = card('Profile');
        const name = within(profile).getByLabelText('Full name');

        await user.type(name, 'x');
        await user.click(
            within(profile).getByRole('button', { name: 'Save profile' }),
        );

        expect(
            await within(profile).findByText(
                'We could not save your profile. Try again.',
            ),
        ).toBeInTheDocument();
    });
});

describe('Change password', () => {
    const fill = async (
        user: ReturnType<typeof userEvent.setup>,
        values: { current: string; password: string; confirm: string },
    ) => {
        const form = card('Change password');
        await user.type(
            within(form).getByLabelText('Current password'),
            values.current,
        );
        await user.type(
            within(form).getByLabelText('New password', { exact: true }),
            values.password,
        );
        await user.type(
            within(form).getByLabelText('Confirm new password'),
            values.confirm,
        );
        await user.click(
            within(form).getByRole('button', { name: 'Change password' }),
        );

        return form;
    };

    it('changes the password, clears the fields and says other sessions were signed out', async () => {
        const { user, source } = await open();
        const change = vi.spyOn(source, 'changePassword');

        const form = await fill(user, {
            current: SAMPLE_PASSWORD,
            password: 'Better-pass-2026',
            confirm: 'Better-pass-2026',
        });

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Password changed. Other sessions were signed out.',
            ),
        );
        expect(change).toHaveBeenCalledWith({
            current: SAMPLE_PASSWORD,
            password: 'Better-pass-2026',
            confirm: 'Better-pass-2026',
        });
        expect(within(form).getByLabelText('Current password')).toHaveValue('');
        expect(
            within(form).getByText(
                'Other signed-in devices will be signed out.',
            ),
        ).toBeInTheDocument();
    });

    it('puts the focus on the current password when it is wrong', async () => {
        const { user } = await open();

        const form = await fill(user, {
            current: 'not-it',
            password: 'Better-pass-2026',
            confirm: 'Better-pass-2026',
        });

        expect(
            await within(form).findByText('That is not your current password.'),
        ).toBeInTheDocument();
        expect(within(form).getByLabelText('Current password')).toHaveFocus();
    });

    it('checks the rule and the match before asking the server', async () => {
        const { user, source } = await open();
        const change = vi.spyOn(source, 'changePassword');

        const weak = await fill(user, {
            current: SAMPLE_PASSWORD,
            password: 'short1',
            confirm: 'short1',
        });
        expect(
            within(weak).getByText(
                'Use at least 10 characters, with letters and numbers.',
            ),
        ).toBeInTheDocument();
        expect(change).not.toHaveBeenCalled();
    });

    it('says the confirmation does not match', async () => {
        const { user } = await open();

        const form = await fill(user, {
            current: SAMPLE_PASSWORD,
            password: 'Better-pass-2026',
            confirm: 'Better-pass-2027',
        });

        expect(
            within(form).getByText('The passwords do not match.'),
        ).toBeInTheDocument();
    });

    it('asks for the current password when it is empty', async () => {
        const { user } = await open();
        const form = card('Change password');

        await user.click(
            within(form).getByRole('button', { name: 'Change password' }),
        );

        expect(
            within(form).getByText('Enter your current password.'),
        ).toBeInTheDocument();
    });

    it('says to wait after too many tries', async () => {
        const { user, source } = await open();
        vi.spyOn(source, 'changePassword').mockRejectedValue(
            new DataError('RATE_LIMITED', 'slow'),
        );

        const form = await fill(user, {
            current: SAMPLE_PASSWORD,
            password: 'Better-pass-2026',
            confirm: 'Better-pass-2026',
        });

        expect(
            await within(form).findByText(
                'Too many tries. Try again in a minute.',
            ),
        ).toBeInTheDocument();
    });
});

describe('Notification preferences', () => {
    it('shows the three choices as they are saved', async () => {
        await open();
        const notifications = card('Notification preferences');

        expect(
            within(notifications).getByRole('switch', {
                name: 'Failed reminders',
            }),
        ).toBeChecked();
        expect(
            within(notifications).getByRole('switch', {
                name: 'Patient cancellations',
            }),
        ).toBeChecked();
        expect(
            within(notifications).getByRole('switch', {
                name: 'Daily summary',
            }),
        ).not.toBeChecked();
    });

    it('saves a choice at once and says so', async () => {
        const { user, source } = await open();
        const save = vi.spyOn(source, 'setNotification');
        const notifications = card('Notification preferences');

        await user.click(
            within(notifications).getByRole('switch', {
                name: 'Daily summary',
            }),
        );

        expect(
            within(notifications).getByRole('switch', {
                name: 'Daily summary',
            }),
        ).toBeChecked();
        expect(save).toHaveBeenCalledWith('dailySummary', true);
        expect(
            await within(notifications).findByText('Saved'),
        ).toBeInTheDocument();
    });

    it('puts a choice back, and says so, when the server refuses it', async () => {
        const { user, source } = await open();
        vi.spyOn(source, 'setNotification').mockRejectedValue(
            new DataError('FORBIDDEN', 'no'),
        );
        const notifications = card('Notification preferences');

        await user.click(
            within(notifications).getByRole('switch', {
                name: 'Failed reminders',
            }),
        );

        expect(
            await within(notifications).findByText(
                'We could not save that choice, so it was put back.',
            ),
        ).toBeInTheDocument();
        expect(
            within(notifications).getByRole('switch', {
                name: 'Failed reminders',
            }),
        ).toBeChecked();
    });
});

describe('Sessions', () => {
    it('asks for the password, signs the others out and counts them', async () => {
        const { user } = await open();
        const sessions = card('Sessions');

        await user.click(
            within(sessions).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );
        const dialog = await screen.findByRole('dialog');
        await user.type(
            within(dialog).getByLabelText('Your password'),
            SAMPLE_PASSWORD,
        );
        await user.click(
            within(dialog).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );

        expect(
            await within(sessions).findByText(
                '2 other sessions were signed out.',
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );

        // Nothing left to sign out the second time.
        await user.click(
            within(sessions).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );
        const again = await screen.findByRole('dialog');
        await user.type(
            within(again).getByLabelText('Your password'),
            SAMPLE_PASSWORD,
        );
        await user.click(
            within(again).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );
        expect(
            await within(sessions).findByText(
                'You are not signed in anywhere else.',
            ),
        ).toBeInTheDocument();
    });

    it('says when the password is wrong and keeps the dialog open', async () => {
        const { user } = await open();
        const sessions = card('Sessions');

        await user.click(
            within(sessions).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText('Your password'), 'nope');
        await user.click(
            within(dialog).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );

        expect(
            await within(dialog).findByText('That is not your password.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('can be cancelled', async () => {
        const { user, source } = await open();
        const out = vi.spyOn(source, 'signOutOthers');

        await user.click(
            within(card('Sessions')).getByRole('button', {
                name: 'Sign out other sessions',
            }),
        );
        await user.click(
            within(await screen.findByRole('dialog')).getByRole('button', {
                name: 'Cancel',
            }),
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(out).not.toHaveBeenCalled();
    });
});

describe('states and languages', () => {
    it('shows loading and an error with retry on request', async () => {
        window.history.replaceState({}, '', '/account?state=loading');
        const loading = render(
            <LocaleScope locale="en">
                <AccountSourceProvider source={sourceFor()}>
                    <Account />
                </AccountSourceProvider>
            </LocaleScope>,
        );
        expect(
            await screen.findByRole('status', { name: 'Loading your account' }),
        ).toBeInTheDocument();
        loading.unmount();

        window.history.replaceState({}, '', '/account?state=error');
        render(
            <LocaleScope locale="en">
                <AccountSourceProvider source={sourceFor()}>
                    <Account />
                </AccountSourceProvider>
            </LocaleScope>,
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
    });

    it('shows a failed load as an error', async () => {
        const source = sourceFor();
        vi.spyOn(source.views, 'account').mockRejectedValue(new Error('down'));
        render(
            <LocaleScope locale="en">
                <AccountSourceProvider source={source}>
                    <Account />
                </AccountSourceProvider>
            </LocaleScope>,
        );

        expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('reads in Urdu, with the email and passwords left to right', async () => {
        await open({ locale: 'ur' });

        expect(
            screen.getByRole('heading', { level: 1, name: 'اکاؤنٹ' }),
        ).toBeInTheDocument();
        const profile = card('پروفائل');
        expect(within(profile).getByLabelText('ای میل')).toHaveAttribute(
            'dir',
            'ltr',
        );
        expect(
            within(profile).getByRole('radio', { name: 'اردو' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'دوسرے سیشنز سائن آؤٹ کریں' }),
        ).toBeInTheDocument();
        expect(
            within(card('پاس ورڈ تبدیل کریں')).getByLabelText('موجودہ پاس ورڈ'),
        ).toHaveAttribute('dir', 'ltr');
    });
});
