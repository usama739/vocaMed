import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Services from './services';

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

const open = async (locale: 'en' | 'ur' = 'en') => {
    const { db, source } = receptionSource('u_admin');
    const result = renderReception(<Services />, { source, locale });
    await screen.findByRole('table');

    return { ...result, db, source };
};

const row = (id: string) =>
    document.querySelector(`[data-service="${id}"]`) as HTMLElement;

const stepper = (dialog: HTMLElement, label: string) =>
    within(within(dialog).getByRole('group', { name: label }));

describe('Admin services', () => {
    it('lists each service with duration, buffer, who offers it and an on/off switch', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Services' }),
        ).toBeInTheDocument();
        const general = row('s_general');

        expect(
            within(general).getByText('General consultation'),
        ).toBeInTheDocument();
        expect(within(general).getByText('20 min')).toBeInTheDocument();
        expect(within(general).getByText('5 min')).toBeInTheDocument();
        // Dr. Sana and Dr. Hina offer it.
        expect(within(general).getByText('2 doctors')).toBeInTheDocument();
        expect(
            within(general).getByRole('switch', {
                name: 'General consultation',
            }),
        ).toBeChecked();
        expect(within(general).getByText('On')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Turning a service off hides it from booking. Existing appointments are kept.',
            ),
        ).toBeInTheDocument();
    });

    it('turns a service off at once and says so', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(
            within(row('s_child')).getByRole('switch', {
                name: 'Child check-up',
            }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Child check-up turned off.',
            ),
        );
        expect(
            (await source.services.list()).find((s) => s.id === 's_child')
                ?.active,
        ).toBe(false);
        await waitFor(() =>
            expect(
                within(row('s_child')).getByRole('switch'),
            ).not.toBeChecked(),
        );
        expect(within(row('s_child')).getByText('Off')).toBeInTheDocument();
    });

    it('puts the switch back and reports an error when the save fails', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        vi.spyOn(source.services, 'setActive').mockRejectedValueOnce(
            new Error('offline'),
        );
        await user.click(
            within(row('s_child')).getByRole('switch', {
                name: 'Child check-up',
            }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'error',
                'Something went wrong. Try again.',
            ),
        );
        expect(within(row('s_child')).getByRole('switch')).toBeChecked();
    });

    it('adds a service with the steppers and the doctors who offer it', async () => {
        const user = userEvent.setup();
        const { source } = await open();

        await user.click(screen.getByRole('button', { name: 'Add service' }));
        const dialog = await screen.findByRole('dialog');

        expect(
            within(dialog).getByText('No doctor offers this yet.'),
        ).toBeInTheDocument();
        await user.type(
            within(dialog).getByLabelText('Service name'),
            'Vaccination',
        );
        await user.click(
            stepper(dialog, 'Duration').getByRole('button', {
                name: 'Decrease by 5 minutes (Duration)',
            }),
        );
        await user.click(
            stepper(dialog, 'Buffer').getByRole('button', {
                name: 'Increase by 5 minutes (Buffer)',
            }),
        );
        expect(stepper(dialog, 'Duration').getByText('25 min')).toBeVisible();
        expect(stepper(dialog, 'Buffer').getByText('15 min')).toBeVisible();

        await user.click(
            within(dialog).getByRole('checkbox', { name: 'Dr. Imran Qureshi' }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save service' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Service saved.'),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const created = (await source.views.adminServices()).services.find(
            (r) => r.service.name === 'Vaccination',
        );

        expect(created?.service).toMatchObject({
            durationMin: 25,
            bufferMin: 15,
            active: true,
        });
        expect(created?.doctorIds).toEqual(['d_imran']);
        expect(await screen.findByText('Vaccination')).toBeInTheDocument();
    });

    it('stops the steppers at the limits', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Add service' }));
        const dialog = await screen.findByRole('dialog');
        const less = stepper(dialog, 'Buffer').getByRole('button', {
            name: 'Decrease by 5 minutes (Buffer)',
        });

        for (let i = 0; i < 2; i++) {
            await user.click(less);
        }

        expect(stepper(dialog, 'Buffer').getByText('0 min')).toBeVisible();
        expect(less).toBeDisabled();
    });

    it('asks for a name, and refuses one that is already used', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Add service' }));
        const dialog = await screen.findByRole('dialog');
        const save = within(dialog).getByRole('button', {
            name: 'Save service',
        });

        await user.click(save);
        expect(
            await within(dialog).findByText('Enter a name for this service.'),
        ).toBeInTheDocument();

        await user.type(
            within(dialog).getByLabelText('Service name'),
            'follow-up visit',
        );
        await user.click(save);
        expect(
            await within(dialog).findByText(
                'Something with this name already exists.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('edits a service and lists inactive doctors as such', async () => {
        const user = userEvent.setup();
        const { db, source } = receptionSource('u_admin');
        db.doctors.find((d) => d.id === 'd_hina')!.active = false;
        renderReception(<Services />, { source });
        await screen.findByRole('table');

        await user.click(
            screen.getByRole('button', { name: 'Edit General consultation' }),
        );
        const dialog = await screen.findByRole('dialog');

        expect(within(dialog).getByText('Edit service')).toBeInTheDocument();
        expect(within(dialog).getByLabelText('Service name')).toHaveValue(
            'General consultation',
        );
        expect(
            within(dialog).getByRole('checkbox', {
                name: 'Dr. Hina Farooq (inactive)',
            }),
        ).toBeChecked();

        await user.clear(within(dialog).getByLabelText('Service name'));
        await user.type(
            within(dialog).getByLabelText('Service name'),
            'Consultation',
        );
        await user.click(
            within(dialog).getByRole('checkbox', {
                name: 'Dr. Hina Farooq (inactive)',
            }),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Save service' }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith('success', 'Service saved.'),
        );
        const saved = (await source.views.adminServices()).services.find(
            (r) => r.service.id === 's_general',
        );

        expect(saved?.service.name).toBe('Consultation');
        expect(saved?.doctorIds).toEqual(['d_sana']);
    });

    it.each([
        ['loading', 'status'],
        ['error', 'alert'],
    ] as const)('shows the %s state on request', async (forced, role) => {
        const { source } = receptionSource('u_admin');
        renderReception(<Services />, { source, forced });

        expect(
            await screen.findByRole(
                role,
                role === 'status' ? { name: 'Loading services' } : undefined,
            ),
        ).toBeInTheDocument();
    });

    it('shows an empty state with the add action', async () => {
        const { source } = receptionSource('u_admin');
        renderReception(<Services />, { source, forced: 'empty' });

        expect(await screen.findByText('No services yet')).toBeInTheDocument();
        expect(
            screen.getAllByRole('button', { name: 'Add service' }),
        ).toHaveLength(2);
    });

    it('works in Urdu', async () => {
        await open('ur');

        expect(
            screen.getByRole('heading', { level: 1, name: 'سروسز' }),
        ).toBeInTheDocument();
        expect(
            within(row('s_general')).getByText('2 ڈاکٹرز'),
        ).toBeInTheDocument();
        expect(
            within(row('s_general')).getByText('20 منٹ'),
        ).toBeInTheDocument();
    });
});
