import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    createMockAuth,
    SAMPLE_PASSWORD,
    SERVER_ERROR_EMAIL,
} from '@/lib/data/auth-mock';
import { renderIn } from '@/test/render';
import { LoginPage } from './login-page';

const setup = (locale: 'en' | 'ur' = 'en') => {
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    const view = renderIn(
        locale,
        <LoginPage source={createMockAuth()} onSignedIn={onSignedIn} />,
    );

    return { onSignedIn, user, ...view };
};

const fill = async (
    user: ReturnType<typeof userEvent.setup>,
    email: string,
    password: string,
) => {
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
};

describe('LoginPage', () => {
    it('shows the form with remember-me off and the secondary links', () => {
        setup();

        expect(
            screen.getByRole('heading', { name: 'Welcome back', level: 1 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: /Remember me/ }),
        ).not.toBeChecked();
        expect(
            screen.getByRole('link', { name: 'Forgot password?' }),
        ).toHaveAttribute('href', '/forgot-password');
        expect(
            screen.getByRole('link', { name: 'Start your clinic' }),
        ).toHaveAttribute('href', '/register');
        expect(
            screen.getByRole('link', { name: 'Privacy and terms' }),
        ).toHaveAttribute('href', '/privacy');
    });

    it('asks for both fields and focuses the first one with a problem', async () => {
        const { user, onSignedIn } = setup();

        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findAllByRole('alert')).toHaveLength(2);
        expect(screen.getByLabelText('Email')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
        expect(screen.getByLabelText('Email')).toHaveFocus();
        expect(onSignedIn).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText('Email'), 'not-an-email');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(
            await screen.findByText('Enter a valid email address.'),
        ).toBeInTheDocument();
    });

    it('shows the mismatch alert, clears the password and returns focus to it', async () => {
        const { user, onSignedIn } = setup();

        await fill(user, 'admin@sample.vocamed.test', 'wrong-password');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'That email and password do not match.',
        );
        expect(screen.getByLabelText('Email')).toHaveValue(
            'admin@sample.vocamed.test',
        );
        expect(screen.getByLabelText('Password')).toHaveValue('');
        await waitFor(() =>
            expect(screen.getByLabelText('Password')).toHaveFocus(),
        );
        expect(onSignedIn).not.toHaveBeenCalled();
    });

    it.each([
        ['admin@sample.vocamed.test', 'clinic_admin'],
        ['reception@sample.vocamed.test', 'receptionist'],
        ['doctor@sample.vocamed.test', 'doctor'],
    ])('signs %s in and reports the %s role', async (email, role) => {
        const { user, onSignedIn } = setup();

        await fill(user, email, SAMPLE_PASSWORD);
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(role));
    });

    it('locks the button after five wrong attempts and shows a countdown', async () => {
        const { user } = setup();

        await user.type(
            screen.getByLabelText('Email'),
            'doctor@sample.vocamed.test',
        );

        for (let i = 0; i < 5; i++) {
            await user.type(
                screen.getByLabelText('Password'),
                'wrong-password',
            );
            await user.click(screen.getByRole('button', { name: 'Sign in' }));
            await waitFor(() =>
                expect(screen.getByLabelText('Password')).toHaveValue(''),
            );
        }

        expect(
            await screen.findByText(
                /Too many attempts. Try again in \d:\d\d\./,
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    });

    it('shows a retryable server error without losing what was typed', async () => {
        const { user } = setup();

        await fill(user, SERVER_ERROR_EMAIL, 'anything-at-all');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong on our side.',
        );
        expect(screen.getByLabelText('Email')).toHaveValue(SERVER_ERROR_EMAIL);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });

    it('toggles password visibility', async () => {
        const { user } = setup();

        await user.type(screen.getByLabelText('Password'), 'abc');
        expect(screen.getByLabelText('Password')).toHaveAttribute(
            'type',
            'password',
        );
        await user.click(
            screen.getByRole('button', { name: 'Show or hide password' }),
        );
        expect(screen.getByLabelText('Password')).toHaveAttribute(
            'type',
            'text',
        );
    });

    it('renders in Urdu, mirrored, with the same fields', () => {
        const { container } = setup('ur');

        expect(
            screen.getByRole('heading', { name: 'خوش آمدید', level: 1 }),
        ).toBeInTheDocument();
        expect(
            container.querySelector('[dir="rtl"][lang="ur"]'),
        ).not.toBeNull();
        expect(screen.getByLabelText('ای میل')).toHaveAttribute('dir', 'ltr');
        expect(screen.getByLabelText('پاس ورڈ')).toHaveAttribute('dir', 'ltr');
        expect(
            screen.getByRole('button', { name: 'سائن اِن' }),
        ).toBeInTheDocument();
    });
});
