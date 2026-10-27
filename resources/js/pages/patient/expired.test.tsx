import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data';
import { freezeClock } from '@/test/reception';
import { renderPatient } from '@/test/patient';
import Expired from './expired';

const page = vi.hoisted(() => ({ token: 'sample-expired' }));

vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
    usePage: () => ({ props: { token: page.token } }),
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState({}, '', '/');
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (token: string, options = {}) => {
    page.token = token;
    const result = renderPatient(<Expired />, options);
    await screen.findByRole('heading', { level: 1 });

    return result;
};

describe('Link expired', () => {
    it('explains, names the clinic and offers a new link and a call', async () => {
        await open('sample-expired');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'This link has expired',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/appointment links stop working after a while/),
        ).toBeInTheDocument();
        expect(screen.getByText('Shifa Family Clinic')).toBeInTheDocument();
        const call = screen.getByRole('link', { name: /Call the clinic/ });
        expect(call).toHaveAttribute('href', 'tel:+922135001122');
        expect(call).toHaveTextContent('0213 5001122');
        expect(
            screen.getByText('Links expire to keep your details private.'),
        ).toBeInTheDocument();
    });

    it('requests a new link and says so, once', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-expired');
        const request = vi.spyOn(links, 'requestNewLink');

        await user.click(
            screen.getByRole('button', { name: 'Send me a new link' }),
        );

        expect(
            await screen.findByText(
                /Request sent\. If the number matches a booking/,
            ),
        ).toBeInTheDocument();
        const done = screen.getByRole('button', { name: /New link requested/ });
        expect(done).toBeDisabled();
        expect(done).toHaveTextContent('✓ New link requested');
        expect(request).toHaveBeenCalledWith('sample-expired');
    });

    it('says to try again when too many requests were made', async () => {
        const user = userEvent.setup();
        const { links } = await open('sample-expired');
        vi.spyOn(links, 'requestNewLink').mockRejectedValue(
            new DataError('RATE_LIMITED', 'slow down'),
        );

        await user.click(
            screen.getByRole('button', { name: 'Send me a new link' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'We could not send that. Try again in a minute.',
        );
        // Still possible to try again.
        expect(
            screen.getByRole('button', { name: 'Send me a new link' }),
        ).toBeEnabled();
    });

    it('names no clinic and offers no phone for an unknown link', async () => {
        await open('sample-unknown');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'We could not open this link',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Call the clinic/ }),
        ).toBeNull();
        expect(screen.getByText('VocaMed')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send me a new link' }),
        ).toBeInTheDocument();
    });

    it('answers the same for a link that is still good', async () => {
        const user = userEvent.setup();
        await open('sample-booked');

        await user.click(
            screen.getByRole('button', { name: 'Send me a new link' }),
        );

        expect(await screen.findByText(/Request sent\./)).toBeInTheDocument();
    });

    it('shows loading and an error on request', async () => {
        window.history.replaceState({}, '', '/?state=error');
        page.token = 'sample-expired';
        renderPatient(<Expired />);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Something went wrong',
        );
    });

    it('reads in Urdu, with the number left to right', async () => {
        await open('sample-expired', { locale: 'ur' });

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'یہ لنک ختم ہو چکا ہے',
            }),
        ).toBeInTheDocument();
        const call = screen.getByRole('link', { name: /کلینک کو کال کریں/ });
        await waitFor(() =>
            expect(call.querySelector('[dir=ltr]')).toHaveTextContent(
                '0213 5001122',
            ),
        );
    });
});
