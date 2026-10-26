import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '@/components/vocamed/toast';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Notifications from './notifications';

vi.mock('@/components/vocamed/toast', () => ({ notify: vi.fn() }));
// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/reception/notifications');
    vi.mocked(notify).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

const ready = async () => {
    const table = await screen.findByRole('table', { name: 'Notifications' });
    await waitFor(() =>
        expect(within(table).getAllByRole('row').length).toBeGreaterThan(1),
    );

    return table;
};

const failedCount = (source: ReturnType<typeof renderReception>['source']) =>
    source.notifications.list({ status: 'failed' });

describe('Notifications', () => {
    it('shows every message with its status, and counts per status', async () => {
        const { source } = renderReception(<Notifications />);
        await ready();
        const all = await source.notifications.list();

        expect(
            screen.getByRole('button', { name: `All (${all.length})` }),
        ).toBeInTheDocument();
        for (const status of [
            'queued',
            'sent',
            'delivered',
            'failed',
        ] as const) {
            const n = (await source.notifications.list({ status })).length;

            expect(
                screen.getByRole('button', {
                    name: new RegExp(`\\(${n}\\)$`),
                }),
            ).toBeDefined();
        }
    });

    it('warns about messages that did not arrive and filters to them', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Notifications />);
        await ready();
        const failed = (await failedCount(source)).length;

        const banner = screen.getByRole('alert');
        expect(banner).toHaveTextContent(
            `${failed} messages were not delivered`,
        );

        await user.click(
            within(banner).getByRole('button', { name: 'Show failed only' }),
        );

        // The table is redrawn for a new filter, so look it up again.
        await waitFor(() =>
            expect(
                within(
                    screen.getByRole('table', { name: 'Notifications' }),
                ).getAllByRole('row'),
            ).toHaveLength(failed + 1),
        );
        const failedTable = screen.getByRole('table', {
            name: 'Notifications',
        });
        expect(screen.getByRole('button', { name: /^Failed/ })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(window.location.search).toContain('status=failed');
        // Every failed row says why, in words.
        expect(
            within(failedTable).getAllByText(
                /not on WhatsApp|could not be reached/,
            ).length,
        ).toBe(failed);
    });

    it('resends a failed message: a new queued row, the old one marked as resent', async () => {
        const user = userEvent.setup();
        const { source } = renderReception(<Notifications />);
        const table = await ready();
        const before = (await source.notifications.list()).length;
        const failed = (await failedCount(source)).length;

        await user.click(
            within(table).getAllByRole('button', { name: /^Resend to / })[0],
        );

        await waitFor(() =>
            expect(notify).toHaveBeenCalledWith(
                'success',
                expect.stringMatching(/^Message queued again for /),
            ),
        );
        expect((await source.notifications.list()).length).toBe(before + 1);
        expect(await screen.findByText('Resent')).toBeInTheDocument();
        // One fewer message still needs attention.
        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(
                failed - 1 === 1
                    ? '1 message was not delivered'
                    : `${failed - 1} messages were not delivered`,
            ),
        );
    });

    it('shows an empty state for a status with no messages', async () => {
        const user = userEvent.setup();
        const { db, source } = receptionSource();
        db.notifications = db.notifications.filter(
            (m) => m.status !== 'queued',
        );
        renderReception(<Notifications />, { source });
        await ready();

        await user.click(screen.getByRole('button', { name: /^Queued/ }));

        expect(
            await screen.findByText('No messages with this status'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Choose another filter to see more.'),
        ).toBeInTheDocument();
    });

    it('runs in Urdu', async () => {
        renderReception(<Notifications />, { locale: 'ur' });

        expect(
            await screen.findByRole('heading', { level: 1 }),
        ).toHaveTextContent('اطلاعات');
        expect(
            await screen.findByText(/پیغامات نہیں پہنچے/),
        ).toBeInTheDocument();
    });
});
