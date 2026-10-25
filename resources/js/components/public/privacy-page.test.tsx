import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderIn } from '@/test/render';
import { PrivacyPage } from './privacy-page';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('PrivacyPage (A7)', () => {
    it('shows the privacy document with six sections and a matching section list', () => {
        renderIn('en', <PrivacyPage />);

        expect(
            screen.getByRole('heading', { name: 'Privacy and terms', level: 1 }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);

        const list = screen.getByRole('navigation', { name: 'On this page' });
        expect(within(list).getAllByRole('link')).toHaveLength(6);
        expect(
            within(list).getByRole('link', { name: 'What patient data is stored' }),
        ).toHaveAttribute('href', '#stored');
    });

    it('keeps every placeholder bracketed and visibly marked, and adds no invented text', () => {
        const { container } = renderIn('en', <PrivacyPage />);
        const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);

        expect(marks).toContain('[DATE]');
        expect(marks).toContain('[SPEECH-TO-TEXT PROVIDER]');
        expect(marks).toContain('[PRIVACY CONTACT EMAIL]');
        expect(marks.every((m) => m?.startsWith('[') && m.endsWith(']'))).toBe(true);
    });

    it('switches to the terms, updates the URL, and back', async () => {
        const user = userEvent.setup();
        renderIn('en', <PrivacyPage />);

        await user.click(screen.getByRole('button', { name: 'Terms of service' }));

        expect(screen.getByRole('button', { name: 'Terms of service' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { name: 'Using VocaMed', level: 2 })).toBeInTheDocument();
        expect(screen.getAllByText(/LEGAL TEXT TO BE SUPPLIED/).length).toBe(6);
        expect(window.location.search).toBe('?doc=terms');

        await user.click(screen.getByRole('button', { name: 'Privacy' }));
        expect(window.location.search).toBe('');
        expect(screen.getByRole('heading', { name: 'Who can see the data', level: 2 })).toBeInTheDocument();
    });

    it('opens on the terms when the link says so', () => {
        window.history.replaceState(null, '', '/privacy?doc=terms');
        renderIn('en', <PrivacyPage />);

        expect(screen.getByRole('button', { name: 'Terms of service' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('moves between the two documents with the arrow keys', async () => {
        const user = userEvent.setup();
        renderIn('en', <PrivacyPage />);

        screen.getByRole('button', { name: 'Privacy' }).focus();
        await user.keyboard('{ArrowRight}');

        expect(screen.getByRole('button', { name: 'Terms of service' })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Terms of service' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders in Urdu with bracketed Urdu placeholders', () => {
        const { container } = renderIn('ur', <PrivacyPage />);

        expect(screen.getByRole('heading', { name: 'رازداری اور شرائط', level: 1 })).toBeInTheDocument();
        expect(container.querySelector('[dir="rtl"][lang="ur"]')).not.toBeNull();
        expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toContain('[تاریخ]');
    });
});
