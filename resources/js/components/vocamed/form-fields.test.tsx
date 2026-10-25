import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderIn } from '@/test/render';
import { PasswordField, PhoneField, TextField } from './form-fields';

describe('form fields', () => {
    it('ties label, hint and error to the input', () => {
        renderIn(
            'en',
            <TextField
                label="Full name"
                hint="As said on the phone."
                error="Enter the name."
            />,
        );

        const input = screen.getByLabelText('Full name');
        const described = input.getAttribute('aria-describedby') ?? '';

        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(described.split(' ')).toHaveLength(2);
        expect(
            document.getElementById(described.split(' ')[0]),
        ).toHaveTextContent('Enter the name.');
        expect(screen.getByRole('alert')).toHaveTextContent('Enter the name.');
    });

    it('marks an optional field in the field language', () => {
        renderIn('ur', <TextField label="نوٹس" optional />);

        expect(screen.getByText('(اختیاری)')).toBeInTheDocument();
    });

    it('toggles password visibility with a labelled 44px button', async () => {
        const user = userEvent.setup();
        renderIn('en', <PasswordField label="Password" />);

        const input = screen.getByLabelText('Password');
        expect(input).toHaveAttribute('type', 'password');

        await user.click(
            screen.getByRole('button', { name: 'Show or hide password' }),
        );

        expect(input).toHaveAttribute('type', 'text');
    });

    it('stores the phone number in international format with the clinic country code', async () => {
        const user = userEvent.setup();

        function Harness() {
            const [phone, setPhone] = useState('');

            return (
                <>
                    <PhoneField
                        label="Phone"
                        value={phone}
                        onValueChange={setPhone}
                    />
                    <output data-testid="e164">{phone}</output>
                </>
            );
        }

        renderIn('en', <Harness />);
        await user.type(screen.getByLabelText('Phone'), '0300 1234567');

        expect(screen.getByTestId('e164')).toHaveTextContent('+923001234567');
    });
});
