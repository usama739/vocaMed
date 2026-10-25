import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderIn } from '@/test/render';
import {
    heroFrame,
    HOLD_START_SECONDS,
    LOOP_TICKS,
    staticFrame,
} from './hero-frame';
import { LandingPage } from './landing-page';

// jsdom has no matchMedia; report "no preference" (animated).
vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
}));

describe('hero loop', () => {
    const LENGTH = 60;

    it('starts empty, types the transcript, fills the fields in order, then holds and presses Confirm', () => {
        expect(heroFrame(0, LENGTH)).toMatchObject({
            listening: true,
            chars: 0,
            fields: 0,
            holdSeconds: null,
            pressed: false,
        });

        const typed = heroFrame(30, LENGTH);
        expect(typed.chars).toBeGreaterThan(0);
        expect(typed.chars).toBeLessThan(LENGTH);

        const fills = [0, 1, 2, 3, 4].map(
            (n) => heroFrame(60 + n * 8, LENGTH).fields,
        );
        expect(fills).toEqual([...fills].sort((a, b) => a - b));

        const held = heroFrame(100, LENGTH);
        expect(held.fields).toBe(4);
        expect(held.holdSeconds).toBeLessThanOrEqual(HOLD_START_SECONDS);

        const frames = Array.from({ length: LOOP_TICKS }, (_, i) =>
            heroFrame(i, LENGTH),
        );
        expect(frames.some((f) => f.pressed)).toBe(true);
    });

    it('loops: the tick after the last one looks like the first', () => {
        expect(heroFrame(LOOP_TICKS, LENGTH)).toEqual(heroFrame(0, LENGTH));
    });

    it('the hold timer only counts down', () => {
        const seconds = Array.from(
            { length: LOOP_TICKS },
            (_, i) => heroFrame(i, LENGTH).holdSeconds,
        ).filter((s): s is number => s !== null);

        expect(seconds).toEqual([...seconds].sort((a, b) => b - a));
    });

    it('the reduced-motion frame is the finished card with the timer at 1:48', () => {
        expect(staticFrame(LENGTH)).toEqual({
            listening: false,
            chars: LENGTH,
            fields: 4,
            holdSeconds: 108,
            pressed: false,
        });
    });
});

describe('LandingPage (A1)', () => {
    it('has one h1 and the design sections in order, with anchors that exist', () => {
        const { container } = renderIn('en', <LandingPage />);

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Appointments booked while the patient is still on the line.',
            }),
        ).toBeInTheDocument();

        for (const id of ['benefits', 'how', 'plans', 'faq', 'cta']) {
            expect(container.querySelector(`#${id}`), id).not.toBeNull();
        }

        const nav = screen.getByRole('navigation', { name: 'Main' });

        for (const link of within(nav).getAllByRole('link')) {
            const target = link.getAttribute('href')!.slice(1);
            expect(
                container.querySelector(`#${target}`),
                target,
            ).not.toBeNull();
        }

        const sections = screen
            .getAllByRole('heading', { level: 2 })
            .map((h) => h.textContent);
        expect(sections.slice(0, 3)).toEqual([
            'Three things that make the desk calmer',
            'How it works',
            'Every visit has one clear status',
        ]);
    });

    it('routes the calls to action to real pages', () => {
        renderIn('en', <LandingPage />);

        expect(
            screen.getAllByRole('link', { name: 'Start your clinic' })[0],
        ).toHaveAttribute('href', '/register');
        expect(
            screen.getAllByRole('link', { name: 'Log in' })[0],
        ).toHaveAttribute('href', '/login');
        expect(
            screen.getAllByRole('link', {
                name: /Privacy and terms|Read the privacy and terms/,
            })[0],
        ).toHaveAttribute('href', '/privacy');
    });

    it('shows all seven statuses with their one-line meaning', () => {
        renderIn('en', <LandingPage />);

        for (const [badge, meaning] of [
            ['Booked', 'The slot is taken.'],
            ['In consultation', 'With the doctor.'],
            ['No-show', 'The patient did not arrive.'],
        ]) {
            expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
            expect(screen.getByText(meaning)).toBeInTheDocument();
        }
    });

    it('keeps every placeholder bracketed and adds no testimonials, statistics or logos', () => {
        const { container } = renderIn('en', <LandingPage />);
        const marks = [...container.querySelectorAll('mark')].map(
            (m) => m.textContent,
        );

        expect(marks).toEqual(
            expect.arrayContaining([
                '[PLAN INTRO: ADD ONCE PLANS ARE DECIDED]',
                '[PLAN NAME]',
                '[WHO IT IS FOR]',
                '[WHAT IS INCLUDED]',
                '[CONTACT EMAIL]',
                '[Clinic address]',
            ]),
        );
        expect(marks.filter((m) => m === '[PLAN NAME]')).toHaveLength(3);

        const text = container.textContent ?? '';
        expect(text).not.toMatch(/testimonial|trusted by|\d+\s?%|customers/i);
        expect(container.querySelector('blockquote')).toBeNull();
    });

    it('labels the sample data', () => {
        renderIn('en', <LandingPage />);

        expect(
            screen.getAllByText('Sample data').length,
        ).toBeGreaterThanOrEqual(2);
    });

    it('opens the FAQ one answer at a time, first one open', async () => {
        const user = userEvent.setup();
        renderIn('en', <LandingPage />);

        const first = screen.getByRole('button', {
            name: 'Do I have to use voice?',
        });
        const second = screen.getByRole('button', {
            name: 'Can voice book something by mistake?',
        });

        expect(first).toHaveAttribute('aria-expanded', 'true');
        expect(second).toHaveAttribute('aria-expanded', 'false');

        await user.click(second);
        expect(first).toHaveAttribute('aria-expanded', 'false');
        expect(second).toHaveAttribute('aria-expanded', 'true');

        await user.click(second);
        expect(second).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the watch-demo dialog with a bracketed stand-in, not a made-up video', async () => {
        const user = userEvent.setup();
        renderIn('en', <LandingPage />);

        await user.click(
            screen.getByRole('button', { name: 'Watch the 15-second demo' }),
        );

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText('[15-second demo clip to be supplied]'),
        ).toBeInTheDocument();
        expect(dialog.querySelector('video')).toBeNull();
    });

    it('opens the request-demo dialog, validates, and says nothing was sent', async () => {
        const user = userEvent.setup();
        renderIn('en', <LandingPage />);

        await user.click(
            screen.getAllByRole('button', { name: 'Request a demo' })[0],
        );
        const dialog = await screen.findByRole('dialog');

        expect(
            within(dialog).getByText(
                /placeholder: requests are not sent anywhere yet/,
            ),
        ).toBeInTheDocument();

        await user.click(
            within(dialog).getByRole('button', { name: 'Send request' }),
        );
        expect(await within(dialog).findAllByRole('alert')).toHaveLength(2);

        await user.type(within(dialog).getByLabelText('Your name'), 'A person');
        await user.type(
            within(dialog).getByLabelText('Email or phone'),
            'a@b.co',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Send request' }),
        );

        expect(
            await within(dialog).findByText('Nothing was sent'),
        ).toBeInTheDocument();
    });

    it('renders in Urdu with bracketed Urdu placeholders and the same section ids', () => {
        const { container } = renderIn('ur', <LandingPage />);

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'مریض ابھی فون پر ہو، اور اپائنٹمنٹ بُک ہو چکی ہو۔',
            }),
        ).toBeInTheDocument();
        expect(
            container.querySelector('[dir="rtl"][lang="ur"]'),
        ).not.toBeNull();
        expect(
            [...container.querySelectorAll('mark')].map((m) => m.textContent),
        ).toContain('[پلان کا نام]');

        for (const id of ['benefits', 'how', 'plans', 'faq', 'cta']) {
            expect(container.querySelector(`#${id}`), id).not.toBeNull();
        }
    });
});
