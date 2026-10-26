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
import Settings from './settings';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head and router need a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => {
    const original = await importOriginal<typeof import('@inertiajs/react')>();

    return {
        ...original,
        Head: () => null,
        router: { ...original.router, on: vi.fn(() => () => undefined) },
    };
});

beforeEach(() => {
    freezeClock();
    vi.mocked(notify).mockClear();
    vi.mocked(router.on).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const open = async (locale: 'en' | 'ur' = 'en') => {
    const { db, source } = receptionSource('u_admin');
    const result = renderReception(<Settings />, { source, locale });
    await screen.findByLabelText(
        locale === 'en' ? 'Clinic name' : 'کلینک کا نام',
    );

    return { ...result, db, source };
};

const day = (name: string) =>
    screen.getByRole('group', { name }) as HTMLElement;
const save = () => screen.getByRole('button', { name: 'Save settings' });

describe('Admin clinic settings', () => {
    it('shows the clinic’s details, hours, holidays, reminders and voice as saved', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Clinic settings' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Clinic name')).toHaveValue(
            'Shifa Family Clinic',
        );
        // The phone is shown in the clinic's national style.
        expect(screen.getByLabelText('Clinic phone')).toHaveValue(
            '0213 5001122',
        );
        expect(screen.getByLabelText('Timezone')).toHaveValue('Asia/Karachi');
        expect(screen.getByRole('radio', { name: 'اردو' })).toBeChecked();

        expect(within(day('Monday')).getAllByText(/^\d\d:\d\d$/)).toHaveLength(
            2,
        );
        expect(within(day('Sunday')).getByText('Closed')).toBeInTheDocument();
        expect(
            screen.getByRole('switch', { name: 'Sunday' }),
        ).not.toBeChecked();

        expect(screen.getByText('Public holiday')).toBeInTheDocument();
        expect(screen.getByText('2026-11-14')).toBeInTheDocument();
        const chips = within(screen.getAllByRole('list')[0]);

        expect(chips.getByText('24 hours before')).toBeInTheDocument();
        expect(chips.getByText('2 hours before')).toBeInTheDocument();
        expect(screen.getByLabelText('Cancellation window')).toHaveValue('4');
        expect(
            screen.getByRole('switch', { name: 'Voice is on' }),
        ).toBeChecked();
        expect(screen.getByLabelText('Keep voice audio for')).toHaveValue('30');
        expect(
            screen.getByRole('switch', {
                name: 'Doctors approve reschedule requests from patients',
            }),
        ).not.toBeChecked();

        // Nothing to save until something changes.
        expect(save()).toBeDisabled();
    });

    it('saves edited details together and confirms with a toast', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const name = screen.getByLabelText('Clinic name');

        await user.clear(name);
        await user.click(name);
        await user.paste('Shifa Clinic');
        const address = screen.getByLabelText('Address');
        await user.click(address);
        await user.keyboard('{End}');
        await user.paste(' (ground floor)');

        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
        expect(save()).toBeEnabled();
        await user.click(save());

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Settings saved'),
        );
        const clinic = await source.clinic.get();

        expect(clinic.name).toBe('Shifa Clinic');
        expect(clinic.address).toBe(
            '14 Khayaban-e-Iqbal, Clifton, Karachi (ground floor)',
        );
        await waitFor(() => expect(save()).toBeDisabled());
        expect(screen.queryByText('Unsaved changes')).toBeNull();
    });

    it('discards edits and goes back to what was saved', async () => {
        const user = userEvent.setup();
        await open();

        await user.type(screen.getByLabelText('Address'), ' x');
        await user.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );

        expect(screen.getByLabelText('Address')).toHaveValue(
            '14 Khayaban-e-Iqbal, Clifton, Karachi',
        );
        expect(save()).toBeDisabled();
    });

    it('asks before leaving with unsaved changes, and only then', async () => {
        const user = userEvent.setup();
        await open();

        expect(router.on).not.toHaveBeenCalled();
        await user.type(screen.getByLabelText('Address'), ' x');

        const call = vi
            .mocked(router.on)
            .mock.calls.find(([event]) => event === 'before');

        expect(call).toBeDefined();
        const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const preventDefault = vi.fn();
        (call![1] as unknown as (event: unknown) => void)({ preventDefault });

        expect(ask).toHaveBeenCalledWith(
            'You have unsaved changes. Leave this page and lose them?',
        );
        expect(preventDefault).toHaveBeenCalled();
        ask.mockRestore();
    });

    it('shows a field error for an empty name and for a phone that is not valid', async () => {
        const user = userEvent.setup();
        await open();
        const name = screen.getByLabelText('Clinic name');
        const phone = screen.getByLabelText('Clinic phone');

        await user.clear(name);
        await user.click(save());
        expect(
            await screen.findByText('Enter the clinic’s name.'),
        ).toBeInTheDocument();
        expect(name).toHaveAttribute('aria-invalid', 'true');

        await user.type(name, 'Shifa');
        await user.clear(phone);
        await user.type(phone, 'abc');
        await user.click(save());
        expect(
            await screen.findByText(
                'Enter a phone number with at least 10 digits.',
            ),
        ).toBeInTheDocument();
        expect(notify).not.toHaveBeenCalled();
    });

    it('moves opening hours by half an hour within the limits, and opens or closes a day', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const monday = within(day('Monday'));

        await user.click(
            monday.getByRole('button', {
                name: 'Later by 30 minutes (Opens)',
            }),
        );
        expect(monday.getByText('09:30')).toBeInTheDocument();
        await user.click(
            monday.getByRole('button', {
                name: 'Earlier by 30 minutes (Closes)',
            }),
        );
        expect(monday.getByText('16:30')).toBeInTheDocument();

        // Opening can never reach closing.
        const sunday = () => within(day('Sunday'));
        await user.click(screen.getByRole('switch', { name: 'Sunday' }));
        expect(sunday().getAllByText(/^\d\d:\d\d$/)).toHaveLength(2);
        await user.click(screen.getByRole('switch', { name: 'Saturday' }));
        expect(within(day('Saturday')).getByText('Closed')).toBeInTheDocument();

        await user.click(save());
        await waitFor(() => expect(notify).toHaveBeenCalled());
        const hours = (await source.clinic.settings()).businessHours;

        expect(hours.find((h) => h.weekday === 1)).toMatchObject({
            open: '09:30',
            close: '16:30',
        });
        expect(hours.find((h) => h.weekday === 0)).toBeDefined();
        expect(hours.find((h) => h.weekday === 6)).toBeUndefined();
    });

    it('stops the steppers at 06:00 and 22:00', async () => {
        const user = userEvent.setup();
        await open();
        const monday = within(day('Monday'));
        const earlier = monday.getByRole('button', {
            name: 'Earlier by 30 minutes (Opens)',
        });

        for (let i = 0; i < 6; i++) {
            await user.click(earlier);
        }

        expect(monday.getByText('06:00')).toBeInTheDocument();
        expect(earlier).toBeDisabled();
    });

    it('adds and removes holidays, and refuses an incomplete or repeated one', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const add = screen.getByRole('button', { name: 'Add holiday' });

        await user.click(add);
        expect(
            screen.getByText('Choose a date and give the holiday a name.'),
        ).toBeInTheDocument();

        await user.type(screen.getByLabelText('Date'), '2026-11-14');
        await user.type(screen.getByLabelText('Name'), 'Again');
        await user.click(add);
        expect(
            screen.getByText('There is already a holiday on that date.'),
        ).toBeInTheDocument();

        await user.clear(screen.getByLabelText('Date'));
        await user.type(screen.getByLabelText('Date'), '2026-12-25');
        await user.click(add);
        expect(screen.getByText('Again')).toBeInTheDocument();

        await user.click(
            screen.getByRole('button', {
                name: 'Remove holiday Public holiday',
            }),
        );
        expect(screen.queryByText('Public holiday')).toBeNull();

        await user.click(save());
        await waitFor(() => expect(notify).toHaveBeenCalled());
        expect((await source.clinic.settings()).holidays).toEqual([
            { date: '2026-12-25', name: 'Again' },
        ]);
    });

    it('adds reminders in order, never twice, and removes them', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const pick = screen.getByLabelText('Add a reminder');

        // 24 and 2 are already there, so they are not offered again.
        const offered = within(pick)
            .getAllByRole('option')
            .map((o) => o.textContent);

        expect(offered).toEqual([
            '48 hours before',
            '12 hours before',
            '4 hours before',
            '1 hour before',
        ]);

        await user.selectOptions(pick, '48');
        await user.click(screen.getByRole('button', { name: 'Add' }));
        await user.click(
            screen.getByRole('button', {
                name: 'Remove reminder: 2 hours before',
            }),
        );

        const chips = screen
            .getAllByRole('listitem')
            .map((li) => li.textContent);

        expect(chips).toEqual(['48 hours before', '24 hours before']);

        await user.click(save());
        await waitFor(() => expect(notify).toHaveBeenCalled());
        expect((await source.clinic.settings()).reminderHoursBefore).toEqual([
            48, 24,
        ]);
    });

    it('sets the cancellation window, including no limit, and the approval switch', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.selectOptions(
            screen.getByLabelText('Cancellation window'),
            'none',
        );
        await user.click(
            screen.getByRole('switch', {
                name: 'Doctors approve reschedule requests from patients',
            }),
        );
        await user.click(save());

        await waitFor(() => expect(notify).toHaveBeenCalled());
        const settings = await source.clinic.settings();

        expect(settings.cancellationWindowHours).toBeNull();
        expect(settings.rescheduleRequiresApproval).toBe(true);
    });

    it('turns voice off, which locks the retention choice and says why', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.selectOptions(
            screen.getByLabelText('Keep voice audio for'),
            '0',
        );
        await user.click(screen.getByRole('switch', { name: 'Voice is on' }));

        expect(
            screen.getByRole('switch', { name: 'Voice is off' }),
        ).not.toBeChecked();
        expect(screen.getByLabelText('Keep voice audio for')).toBeDisabled();
        expect(
            screen.getByText(
                'Turn voice booking on to choose how long audio is kept.',
            ),
        ).toBeInTheDocument();

        await user.click(save());
        await waitFor(() => expect(notify).toHaveBeenCalled());
        expect(await source.clinic.settings()).toMatchObject({
            voiceEnabled: false,
            voiceAudioRetentionDays: 0,
        });
    });

    it('asks before changing the timezone, and saves only when confirmed', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.selectOptions(
            screen.getByLabelText('Timezone'),
            'Asia/Dubai',
        );
        await user.click(save());

        const dialog = await screen.findByRole('alertdialog');

        expect(
            within(dialog).getByText('Change the timezone?'),
        ).toBeInTheDocument();
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect((await source.clinic.get()).timezone).toBe('Asia/Karachi');
        expect(notify).not.toHaveBeenCalled();

        await user.click(save());
        await user.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Change timezone and save',
            }),
        );
        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Settings saved'),
        );
        expect((await source.clinic.get()).timezone).toBe('Asia/Dubai');
    });

    it('reports a failed save as an error toast and keeps the edits', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        vi.spyOn(source.settings, 'save').mockRejectedValueOnce(
            new Error('offline'),
        );
        await user.type(screen.getByLabelText('Address'), ' x');
        await user.click(save());

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'error',
                'Something went wrong. Try again.',
            ),
        );
        expect(screen.getByLabelText('Address')).toHaveValue(
            '14 Khayaban-e-Iqbal, Clifton, Karachi x',
        );
        expect(save()).toBeEnabled();
    });

    it.each([
        ['loading', 'status'],
        ['error', 'alert'],
    ] as const)('shows the %s state on request', async (forced, role) => {
        const { source } = receptionSource('u_admin');
        renderReception(<Settings />, { source, forced });

        expect(
            await screen.findByRole(
                role,
                role === 'status'
                    ? { name: 'Loading clinic settings' }
                    : undefined,
            ),
        ).toBeInTheDocument();
    });

    it('works in Urdu', async () => {
        await open('ur');

        expect(
            screen.getByRole('heading', { level: 1, name: 'کلینک کی سیٹنگز' }),
        ).toBeInTheDocument();
        expect(
            within(screen.getAllByRole('list')[0]).getByText('24 گھنٹے پہلے'),
        ).toBeInTheDocument();
        expect(within(day('پیر')).getAllByText(/^\d\d:\d\d$/)).toHaveLength(2);
    });
});
