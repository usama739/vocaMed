import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockAuth, SERVER_ERROR_EMAIL } from '@/lib/data/auth-mock';
import { renderIn } from '@/test/render';
import { ForgotPage } from './forgot-page';
import { InvitePage } from './invite-page';
import { ResetPage } from './reset-page';

const source = () => createMockAuth();

describe('ForgotPage (A4)', () => {
    it('validates the address, then shows the same neutral message for any address', async () => {
        const user = userEvent.setup();
        renderIn('en', <ForgotPage source={source()} />);

        await user.click(
            screen.getByRole('button', { name: 'Send reset link' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'This field is required.',
        );
        expect(screen.getByLabelText('Email')).toHaveFocus();

        await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
        await user.click(
            screen.getByRole('button', { name: 'Send reset link' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Check your email' }),
        ).toHaveFocus();
        expect(
            screen.getByText(/If an account exists for that email/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to sign in' }),
        ).toHaveAttribute('href', '/login');
    });

    it('shows a retryable error when the server fails', async () => {
        const user = userEvent.setup();
        renderIn('en', <ForgotPage source={source()} />);

        await user.type(screen.getByLabelText('Email'), SERVER_ERROR_EMAIL);
        await user.click(
            screen.getByRole('button', { name: 'Send reset link' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
        expect(screen.getByLabelText('Email')).toHaveValue(SERVER_ERROR_EMAIL);
    });

    it('renders in Urdu with the email field kept ltr', () => {
        renderIn('ur', <ForgotPage source={source()} />);

        expect(
            screen.getByRole('heading', { name: 'اپنا پاس ورڈ ری سیٹ کریں' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('ای میل')).toHaveAttribute('dir', 'ltr');
    });
});

describe('ResetPage (A5)', () => {
    it('keeps Save off until the password is strong enough and both match', async () => {
        const user = userEvent.setup();
        renderIn('en', <ResetPage token="sample-valid" source={source()} />);

        const save = await screen.findByRole('button', {
            name: 'Save new password',
        });
        expect(save).toBeDisabled();
        expect(screen.getByText('Not set')).toBeInTheDocument();

        await user.type(screen.getByLabelText('New password'), 'abc');
        expect(screen.getByText('Weak')).toBeInTheDocument();

        await user.clear(screen.getByLabelText('New password'));
        await user.type(screen.getByLabelText('New password'), 'abcdefghi1');
        expect(screen.getByText('Fair')).toBeInTheDocument();

        await user.type(
            screen.getByLabelText('Confirm new password'),
            'different1',
        );
        expect(
            await screen.findByText('The two passwords do not match.'),
        ).toBeInTheDocument();
        expect(save).toBeDisabled();

        await user.clear(screen.getByLabelText('Confirm new password'));
        await user.type(
            screen.getByLabelText('Confirm new password'),
            'abcdefghi1',
        );
        expect(save).toBeEnabled();
    });

    it('flags a weak password once the field has been left', async () => {
        const user = userEvent.setup();
        renderIn('en', <ResetPage token="sample-valid" source={source()} />);

        await user.type(await screen.findByLabelText('New password'), 'short');
        await user.tab();

        expect(
            await screen.findByText(
                'Use at least 10 characters, with letters and numbers.',
            ),
        ).toBeInTheDocument();
    });

    it('saves and shows the done state with a Sign in button', async () => {
        const user = userEvent.setup();
        renderIn('en', <ResetPage token="sample-valid" source={source()} />);

        await user.type(
            await screen.findByLabelText('New password'),
            'abcdefghi1',
        );
        await user.type(
            screen.getByLabelText('Confirm new password'),
            'abcdefghi1',
        );
        await user.click(
            screen.getByRole('button', { name: 'Save new password' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Password updated' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login',
        );
    });

    it.each(['sample-expired', 'unknown-token'])(
        'shows the expired state for %s',
        async (token) => {
            renderIn('en', <ResetPage token={token} source={source()} />);

            expect(
                await screen.findByRole('heading', {
                    name: 'This link has expired',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: 'Request a new link' }),
            ).toHaveAttribute('href', '/forgot-password');
        },
    );

    it('announces loading while the link is checked', () => {
        renderIn('en', <ResetPage token="sample-valid" source={source()} />);

        expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });
});

describe('InvitePage (A6)', () => {
    it.each([
        ['sample-receptionist', 'Receptionist'],
        ['sample-doctor', 'Doctor'],
        ['sample-admin', 'Clinic Admin'],
    ])(
        'shows the bracketed clinic and the role for %s',
        async (token, role) => {
            renderIn('en', <InvitePage token={token} source={source()} />);

            expect(
                await screen.findByText('[Clinic name]'),
            ).toBeInTheDocument();
            expect(screen.getByText(role)).toBeInTheDocument();
        },
    );

    it('translates the role and keeps the clinic placeholder bracketed in Urdu', async () => {
        renderIn('ur', <InvitePage token="sample-doctor" source={source()} />);

        expect(await screen.findByText('[کلینک کا نام]')).toBeInTheDocument();
        expect(screen.getByText('ڈاکٹر')).toBeInTheDocument();
    });

    it('validates, accepts, and lands on Welcome aboard', async () => {
        const user = userEvent.setup();
        renderIn(
            'en',
            <InvitePage token="sample-receptionist" source={source()} />,
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Accept invitation and continue',
            }),
        );
        expect(await screen.findAllByRole('alert')).toHaveLength(2);
        expect(screen.getByLabelText('Your full name')).toHaveFocus();

        await user.type(
            screen.getByLabelText('Your full name'),
            'Sample Person',
        );
        await user.type(screen.getByLabelText('Choose a password'), 'short');
        await user.click(
            screen.getByRole('button', {
                name: 'Accept invitation and continue',
            }),
        );
        expect(
            await screen.findByText(
                'Use at least 10 characters, with letters and numbers.',
            ),
        ).toBeInTheDocument();

        await user.clear(screen.getByLabelText('Choose a password'));
        await user.type(
            screen.getByLabelText('Choose a password'),
            'abcdefghi1',
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Accept invitation and continue',
            }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Welcome aboard' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Sign in' }),
        ).toBeInTheDocument();
    });

    it('shows expired (no action) and used (Sign in) states, and treats unknown links as expired', async () => {
        const { unmount } = renderIn(
            'en',
            <InvitePage token="sample-expired" source={source()} />,
        );
        expect(
            await screen.findByRole('heading', {
                name: 'This invitation has expired',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
        unmount();

        const second = renderIn(
            'en',
            <InvitePage token="whatever" source={source()} />,
        );
        expect(
            await screen.findByRole('heading', {
                name: 'This invitation has expired',
            }),
        ).toBeInTheDocument();
        second.unmount();

        renderIn('en', <InvitePage token="sample-used" source={source()} />);
        await waitFor(() =>
            expect(
                screen.getByRole('heading', {
                    name: 'This invitation was already used',
                }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login',
        );
    });
});
