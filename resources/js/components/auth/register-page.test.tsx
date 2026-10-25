import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
    createMockAuth,
    SERVER_ERROR_EMAIL,
    TAKEN_EMAIL,
} from '@/lib/data/auth-mock';
import { renderIn } from '@/test/render';
import { RegisterPage } from './register-page';

const fill = async (
    user: ReturnType<typeof userEvent.setup>,
    email = 'new@yourclinic.com',
) => {
    await user.type(screen.getByLabelText('Clinic name'), 'A clinic');
    await user.type(screen.getByLabelText('Your full name'), 'A person');
    await user.type(screen.getByLabelText('Work email'), email);
    await user.type(screen.getByLabelText('Password'), 'abcdefghi1');
    await user.click(screen.getByRole('checkbox'));
};

describe('RegisterPage (A2)', () => {
    it('starts with Pakistan and its timezone selected', () => {
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        expect(
            screen.getByRole('combobox', { name: 'Country' }),
        ).toHaveTextContent('Pakistan');
        expect(
            screen.getByRole('combobox', { name: 'Timezone' }),
        ).toHaveTextContent('Asia/Karachi (UTC+5)');
        expect(
            screen.getByRole('link', { name: 'terms and privacy policy' }),
        ).toHaveAttribute('href', '/privacy');
    });

    it('lists every problem at once and focuses the first', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );

        expect(await screen.findAllByRole('alert')).toHaveLength(5);
        expect(screen.getByLabelText('Clinic name')).toHaveFocus();
        expect(
            screen.getByText('Tick the box to continue.'),
        ).toBeInTheDocument();
    });

    it('clears an error as soon as the field is fixed', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );
        expect(screen.getByLabelText('Clinic name')).toHaveAttribute(
            'aria-invalid',
            'true',
        );

        await user.type(screen.getByLabelText('Clinic name'), 'x');
        expect(screen.getByLabelText('Clinic name')).not.toHaveAttribute(
            'aria-invalid',
        );
    });

    it('rejects a weak password and a malformed email', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await user.type(screen.getByLabelText('Work email'), 'nope');
        await user.type(screen.getByLabelText('Password'), 'short');
        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );

        expect(
            await screen.findByText('Enter a valid email address.'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Use at least 10 characters, with letters and numbers.',
            ),
        ).toBeInTheDocument();
    });

    it('shows Check your email, and "Use a different email" returns to the filled form', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await fill(user);
        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );

        expect(
            await screen.findByRole('heading', { name: 'Check your email' }),
        ).toHaveFocus();

        await user.click(
            screen.getByRole('button', { name: 'Use a different email' }),
        );
        expect(screen.getByLabelText('Work email')).toHaveValue(
            'new@yourclinic.com',
        );
        expect(screen.getByLabelText('Clinic name')).toHaveValue('A clinic');
    });

    it('flags an email that already has a workspace', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await fill(user, TAKEN_EMAIL);
        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );

        expect(
            await screen.findByText(
                'An account already exists for this email.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Work email')).toHaveFocus();
    });

    it('shows a server error and keeps the form filled', async () => {
        const user = userEvent.setup();
        renderIn('en', <RegisterPage source={createMockAuth()} />);

        await fill(user, SERVER_ERROR_EMAIL);
        await user.click(
            screen.getByRole('button', { name: 'Create clinic workspace' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
        expect(screen.getByLabelText('Clinic name')).toHaveValue('A clinic');
    });

    it('renders in Urdu with translated country names', () => {
        const { container } = renderIn(
            'ur',
            <RegisterPage source={createMockAuth()} />,
        );

        expect(
            screen.getByRole('heading', { name: 'اپنا کلینک شروع کریں' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'ملک' })).toHaveTextContent(
            'پاکستان',
        );
        expect(
            container.querySelector('[dir="rtl"][lang="ur"]'),
        ).not.toBeNull();
    });
});
