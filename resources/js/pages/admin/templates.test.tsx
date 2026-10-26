import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Templates from './templates';

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

const open = async (
    options: Parameters<typeof renderReception>[1] = {},
    actor = 'u_admin',
) => {
    const { db, source } = receptionSource(actor);
    const result = renderReception(<Templates />, { source, ...options });
    await screen.findByRole('tablist');

    return { ...result, db, source };
};

const box = () => screen.getByRole('textbox', { name: /^(Message|پیغام)$/ });
const value = () => (box() as HTMLTextAreaElement).value;
const edit = (next: string) =>
    fireEvent.change(box(), { target: { value: next } });

describe('Notification templates', () => {
    it('shows the four message tabs, SMS and English first, with the sample preview', async () => {
        await open();
        const tabs = screen.getByRole('tablist');

        expect(
            within(tabs)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Confirmation', 'Reminder', 'Reschedule', 'Cancellation']);
        expect(
            within(tabs).getByRole('tab', { name: 'Confirmation' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: 'SMS' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(value()).toContain('{patient_name}');

        const preview = screen.getByRole('region', { name: 'Message preview' });

        expect(preview).toHaveTextContent('Hi Ayesha Khan');
        expect(preview).toHaveTextContent('Dr. Rahman');
        expect(preview).toHaveTextContent('Shifa Family Clinic');
        expect(preview).not.toHaveTextContent('{patient_name}');
        expect(
            screen.getByText(/^\d+ characters · \d+ message parts?$/),
        ).toBeVisible();
        expect(screen.getByText('Standard characters')).toBeVisible();
    });

    it('marks an edited message as customised and shows the stored wording', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('tab', { name: 'Reminder' }));

        expect(screen.getByText('Customised')).toBeVisible();
        expect(value()).toContain('Reminder from {clinic_name}');

        await user.click(screen.getByRole('tab', { name: 'Reschedule' }));

        expect(screen.queryByText('Customised')).not.toBeInTheDocument();
    });

    it('keeps an unsaved draft for each combination and marks where it is', async () => {
        const user = userEvent.setup();
        await open();

        edit('Hello {patient_name}');
        expect(screen.getByText('Unsaved changes')).toBeVisible();
        expect(
            screen.getByRole('tab', {
                name: 'Confirmation unsaved changes',
            }),
        ).toBeInTheDocument();

        // Another language is another message: it starts from its own saved wording.
        await user.click(
            screen.getByRole('button', {
                name: /^اردو unsaved changes$|^اردو$/,
            }),
        );
        expect(value()).toContain('السلام علیکم');
        expect(
            screen.getByRole('button', { name: 'English unsaved changes' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'English unsaved changes' }),
        );
        expect(box()).toHaveValue('Hello {patient_name}');

        // The other tabs are not marked.
        expect(
            screen.getByRole('tab', { name: 'Reminder' }),
        ).toBeInTheDocument();
    });

    it('shows only the character count for WhatsApp, with the approval note', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'WhatsApp' }));

        expect(screen.getByRole('note')).toHaveTextContent(
            'WhatsApp templates need approval',
        );
        expect(screen.getByText(/^\d+ characters$/)).toBeVisible();
        expect(screen.queryByText(/message part/)).not.toBeInTheDocument();
        expect(
            screen.queryByText('Standard characters'),
        ).not.toBeInTheDocument();
    });

    it('counts SMS parts with the shorter limits for Urdu text', async () => {
        const user = userEvent.setup();
        await open();

        edit('a'.repeat(160));
        // Sample details fill {patient_name} and friends; plain text only here, so 160 is one part.
        expect(
            screen.getByText('160 characters · 1 message part'),
        ).toBeVisible();

        edit('a'.repeat(161));
        expect(
            screen.getByText('161 characters · 2 message parts'),
        ).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'اردو' }));
        edit('ا'.repeat(71));
        expect(
            screen.getByText('71 characters · 2 message parts'),
        ).toBeVisible();
        expect(
            screen.getByText('Urdu text uses shorter parts (70 characters)'),
        ).toBeVisible();
    });

    it('inserts a variable where the cursor is', async () => {
        const user = userEvent.setup();
        await open();

        edit('Hi , bye');
        const area = box() as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(3, 3);
        await user.click(
            screen.getByRole('button', { name: '{patient_name}' }),
        );

        expect(box()).toHaveValue('Hi {patient_name}, bye');
        expect((box() as HTMLTextAreaElement).selectionStart).toBe(17);
    });

    it('puts a variable on the end when the box has not been used yet', async () => {
        const user = userEvent.setup();
        await open();
        const before = (box() as HTMLTextAreaElement).value;

        await user.click(screen.getByRole('button', { name: '{link}' }));

        expect(box()).toHaveValue(`${before}{link}`);
    });

    it('refuses an unknown variable and an empty message', async () => {
        await open();
        const save = screen.getByRole('button', { name: 'Save template' });

        edit('Hi {nonsense}');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Unknown variable {nonsense}.',
        );
        expect(save).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Send test message' }),
        ).toBeDisabled();

        edit('');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Write a message before saving.',
        );
        expect(save).toBeDisabled();

        edit('Hi {patient_name}');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(save).toBeEnabled();
    });

    it('saves the visible message, which becomes customised', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        edit('Hi {patient_name}, see you at {time}.');
        await user.click(screen.getByRole('button', { name: 'Save template' }));

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Template saved.'),
        );
        await screen.findByText('Customised');
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

        const view = await source.views.adminTemplates();

        expect(
            view.templates.find(
                (t) =>
                    t.kind === 'confirmation' &&
                    t.channel === 'sms' &&
                    t.locale === 'en',
            ),
        ).toMatchObject({
            body: 'Hi {patient_name}, see you at {time}.',
            isCustom: true,
        });
    });

    it('goes back to the default wording, and saves that when the message was customised', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(screen.getByRole('tab', { name: 'Reminder' }));
        const reset = screen.getByRole('button', { name: 'Reset to default' });

        expect(reset).toBeEnabled();
        await user.click(reset);

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'The message is back to the default wording.',
            ),
        );
        await waitFor(() =>
            expect(screen.queryByText('Customised')).not.toBeInTheDocument(),
        );
        expect(value()).toContain('Reminder: {patient_name}');
        expect(
            screen.getByRole('button', { name: 'Reset to default' }),
        ).toBeDisabled();
        expect(
            (await source.views.adminTemplates()).templates.some(
                (t) => t.isCustom,
            ),
        ).toBe(false);
    });

    it('drops unsaved edits on reset without touching what is saved', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        edit('Something else entirely');
        await user.click(
            screen.getByRole('button', { name: 'Reset to default' }),
        );

        expect(value()).toContain('Hi {patient_name}, your appointment');
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
        expect(notify).not.toHaveBeenCalled();
        expect(
            (await source.views.adminTemplates()).templates.filter(
                (t) => t.isCustom,
            ),
        ).toHaveLength(1);
    });

    it('sends a test message to a valid phone and complains about an invalid one', async () => {
        const user = userEvent.setup();
        await open();
        const phone = screen.getByLabelText('Send to this phone');
        const send = screen.getByRole('button', { name: 'Send test message' });

        await user.type(phone, '12');
        await user.click(send);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Enter a phone number with at least 10 digits.',
        );

        await user.clear(phone);
        await user.type(phone, '0300 1234567');
        await user.click(send);

        expect(
            await screen.findByText('Test sent to +923001234567'),
        ).toBeVisible();
    });

    it('is refused for anyone but the clinic admin', async () => {
        renderReception(<Templates />, {
            source: receptionSource('u_recep').source,
        });

        expect(
            await screen.findByRole('button', { name: 'Retry' }),
        ).toBeVisible();
    });

    it('shows the page in Urdu, and the message in its own direction', async () => {
        const user = userEvent.setup();
        renderReception(<Templates />, {
            locale: 'ur',
            source: receptionSource('u_admin').source,
        });
        await screen.findByRole('tablist');

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'اطلاعی پیغامات کے سانچے',
            }),
        ).toBeVisible();
        expect(screen.getByRole('tab', { name: 'تصدیق' })).toBeVisible();
        // An English message on an Urdu page still reads left to right.
        expect(box()).toHaveAttribute('dir', 'ltr');

        await user.click(screen.getByRole('button', { name: 'اردو' }));

        expect(box()).toHaveAttribute('dir', 'rtl');
        expect(
            screen.getByRole('region', { name: 'پیغام کا پیش منظر' }),
        ).toHaveAttribute('dir', 'rtl');
        expect(
            screen.getByText(/^\d+ حروف · \d+ پیغام کے? ?حصے?$/),
        ).toBeVisible();
    });

    it('shows loading, and an error with Retry', async () => {
        const { source } = receptionSource('u_admin');
        const first = renderReception(<Templates />, {
            source,
            forced: 'loading',
        });

        expect(
            await screen.findByRole('status', {
                name: 'Loading the message templates',
            }),
        ).toBeVisible();
        first.unmount();

        renderReception(<Templates />, { source, forced: 'error' });
        expect(
            await screen.findByRole('button', { name: 'Retry' }),
        ).toBeVisible();
    });
});
