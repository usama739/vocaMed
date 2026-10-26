import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import { createMockDataSource } from '@/lib/data/mock';
import { DEMO_CLINIC_ID } from '@/lib/data/seed';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Requests from './requests';

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

const open = async () => {
    const { db, source } = receptionSource('u_doc1');
    const result = renderReception(<Requests />, { source });
    await screen.findByRole('heading', { name: /Waiting for you/ });

    return { ...result, db, source };
};

const card = (id: string) =>
    document.querySelector(`[data-request="${id}"]`) as HTMLElement;

describe('Doctor requests', () => {
    it('lists what is waiting, with the current and requested time, and the history', async () => {
        await open();

        expect(
            screen.getByRole('heading', { name: 'Waiting for you (2)' }),
        ).toBeInTheDocument();
        const first = card('rq_2');

        expect(within(first).getByText('Pending')).toBeInTheDocument();
        expect(within(first).getByText('Current time')).toBeInTheDocument();
        expect(within(first).getByText('Requested time')).toBeInTheDocument();
        expect(
            within(first).getByLabelText('Message to reception (optional)'),
        ).toBeInTheDocument();

        const history = screen.getByRole('table', { name: 'History' });

        expect(within(history).getByText('Approved')).toBeInTheDocument();
        expect(within(history).getByText('Rejected')).toBeInTheDocument();
        expect(
            within(history).getByText('No slots that evening'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Planned for phase 2', { exact: false }),
        ).toBeInTheDocument();
    });

    it('approves: the appointment moves, the card goes to history and the badge count refreshes', async () => {
        const user = userEvent.setup();
        const { source, runtime } = await open();
        const target = card('rq_1');

        await user.type(
            within(target).getByLabelText('Message to reception (optional)'),
            'See you then',
        );
        await user.click(
            within(target).getByRole('button', { name: /^Approve/ }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Request approved. Reception and the patient are notified.',
            ),
        );
        const view = await source.views.requests();

        expect(view.pending).toHaveLength(1);
        expect(
            view.history.find((r) => r.request.id === 'rq_1')?.request.message,
        ).toBe('See you then');
        expect(runtime.refresh).toHaveBeenCalled();
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Waiting for you (1)' }),
            ).toBeInTheDocument(),
        );
    });

    it('rejects and keeps the appointment where it was', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const before = (await source.appointments.get('a_020')).startsAt;

        await user.click(
            within(card('rq_2')).getByRole('button', { name: /^Reject/ }),
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                'Request rejected. Reception and the patient are notified.',
            ),
        );
        expect((await source.appointments.get('a_020')).startsAt).toBe(before);
    });

    it('explains a time that was taken meanwhile, with the nearest free times, and still allows Reject', async () => {
        const user = userEvent.setup();
        const { db, source } = await open();
        const reception = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_recep',
            now: () => new Date(),
        });
        const request = (await source.views.requests()).pending.find(
            (r) => r.request.id === 'rq_1',
        )!.request;

        // Reception books the requested time first.
        await reception.appointments.create({
            patientId: 'p_1',
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: request.proposedStartsAt,
            source: 'manual',
        });
        await user.click(
            within(card('rq_1')).getByRole('button', { name: /^Approve/ }),
        );

        const alert = await within(card('rq_1')).findByRole('alert');

        expect(alert).toHaveTextContent('That time was taken in the meantime.');
        expect(alert).toHaveTextContent('Nearest free times:');
        expect(
            within(card('rq_1')).getByRole('button', { name: /^Approve/ }),
        ).toBeDisabled();
        expect(
            within(card('rq_1')).getByRole('button', { name: /^Reject/ }),
        ).toBeEnabled();
        expect(notify).not.toHaveBeenCalledWith('success', expect.anything());
    });

    it('shows an empty state when nothing is waiting', async () => {
        renderReception(<Requests />, {
            source: receptionSource('u_doc1').source,
            forced: 'empty',
        });

        expect(
            await screen.findByText('No pending requests'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('New requests appear here.'),
        ).toBeInTheDocument();
    });

    it('runs in Urdu, with the arrow flipped', async () => {
        const { container } = renderReception(<Requests />, {
            source: receptionSource('u_doc1').source,
            locale: 'ur',
        });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('وقت بدلنے کی درخواستیں');
        expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    });
});
