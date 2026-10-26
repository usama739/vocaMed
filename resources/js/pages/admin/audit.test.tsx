import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    freezeClock,
    receptionSource,
    renderReception,
} from '@/test/reception';
import Audit from './audit';

// The page head needs a running Inertia app; the tests only look at the page body.
vi.mock('@inertiajs/react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@inertiajs/react')>()),
    Head: () => null,
}));

beforeEach(() => {
    freezeClock();
    window.history.replaceState(null, '', '/');
});

afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
});

const open = async (
    options: Parameters<typeof renderReception>[1] = {},
    actor = 'u_admin',
) => {
    const { db, source } = receptionSource(actor);
    const result = renderReception(<Audit />, { source, ...options });
    await screen.findByRole('table');

    return { ...result, db, source };
};

const rows = () =>
    screen.getAllByRole('row').filter((row) => row.hasAttribute('data-audit'));
const count = () => screen.getByText(/^\d+ entr(y|ies)$/).textContent;
const chip = (name: string) => screen.getByRole('button', { name });

describe('Audit log', () => {
    it('shows a read-only table with the day, user, action and details of each entry', async () => {
        await open();

        expect(
            screen.getByRole('heading', { level: 1, name: 'Audit log' }),
        ).toBeVisible();
        expect(screen.getByText('Read-only')).toBeVisible();
        const table = screen.getByRole('table', { name: 'Audit log' });

        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((c) => c.textContent),
        ).toEqual(['When', 'User', 'Action', 'Details']);

        const first = rows()[0];

        expect(within(first).getAllByRole('cell')).toHaveLength(4);
        expect(first).toHaveTextContent(/Today|Yesterday|\d+ days ago/);
        expect(first).toHaveTextContent(/\d{2}:\d{2}/);
        // Nothing in the log can be edited or removed.
        expect(within(table).queryAllByRole('button')).toHaveLength(0);
        expect(screen.getByRole('group', { name: 'Date' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'User' })).toBeInTheDocument();
        expect(
            screen.getByRole('group', { name: 'Action' }),
        ).toBeInTheDocument();
    });

    it('defaults to the last 30 days and lists the people who acted as user chips', async () => {
        await open();
        const dates = screen.getByRole('group', { name: 'Date' });

        expect(
            within(dates).getByRole('button', { name: 'Last 30 days' }),
        ).toHaveAttribute('aria-pressed', 'true');
        const users = screen.getByRole('group', { name: 'User' });

        for (const name of [
            'All',
            'Ayesha Khan',
            'Bilal Ahmed',
            'Hira Nawaz',
        ]) {
            expect(
                within(users).getByRole('button', { name }),
            ).toBeInTheDocument();
        }
    });

    it('filters by date, and keeps the filter in the address', async () => {
        const user = userEvent.setup();
        await open();
        const before = Number.parseInt(count() ?? '0', 10);

        await user.click(chip('Today'));
        await waitFor(() =>
            expect(Number.parseInt(count() ?? '0', 10)).toBeLessThan(before),
        );

        expect(window.location.search).toBe('?days=1');
        expect(chip('Today')).toHaveAttribute('aria-pressed', 'true');

        await user.click(chip('Last 7 days'));
        await waitFor(() => expect(window.location.search).toBe('?days=7'));

        await user.click(chip('Last 30 days'));
        // The default is not written into the address.
        await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('filters by user', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(chip('Hira Nawaz'));
        await waitFor(() =>
            expect(window.location.search).toBe('?user=u_recep2'),
        );
        await waitFor(() => expect(rows().length).toBeGreaterThan(0));
        await waitFor(() => {
            for (const row of rows()) {
                expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(
                    'Hira Nawaz',
                );
            }
        });
    });

    it('filters by action', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(
            within(screen.getByRole('group', { name: 'Action' })).getByRole(
                'button',
                { name: 'Sign-in' },
            ),
        );
        await waitFor(() =>
            expect(window.location.search).toBe('?action=login'),
        );
        await waitFor(() => {
            expect(rows().length).toBeGreaterThan(0);

            for (const row of rows()) {
                expect(row).toHaveTextContent(/Signed in/);
            }
        });
    });

    it('starts from the filters in the address', async () => {
        window.history.replaceState(null, '', '/?days=7&action=settings');
        await open();

        expect(chip('Last 7 days')).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(screen.getByRole('group', { name: 'Action' })).getByRole(
                'button',
                { name: 'Settings changed' },
            ),
        ).toHaveAttribute('aria-pressed', 'true');
        await waitFor(() => expect(rows().length).toBeGreaterThan(0));

        for (const row of rows()) {
            expect(row).toHaveTextContent(/Settings changed|The .* message/);
        }
    });

    it('shows an empty state when nothing matches, and Clear filters brings everything back', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(chip('Today'));
        await user.click(
            within(screen.getByRole('group', { name: 'Action' })).getByRole(
                'button',
                { name: 'Staff invited' },
            ),
        );

        expect(
            await screen.findByText('No activity matches these filters'),
        ).toBeVisible();
        expect(count()).toBe('0 entries');

        await user.click(screen.getByRole('button', { name: 'Clear filters' }));

        await waitFor(() =>
            expect(
                screen.queryByText('No activity matches these filters'),
            ).not.toBeInTheDocument(),
        );
        expect(window.location.search).toBe('');
        expect(rows().length).toBeGreaterThan(0);
    });

    it('pages through 25 entries at a time', async () => {
        const user = userEvent.setup();
        const { source } = await open();
        const all = await source.views.adminAudit({ days: 30, page: 1 });

        expect(all.total).toBeGreaterThan(25);
        expect(rows()).toHaveLength(25);
        expect(count()).toBe(`${all.total} entries`);
        expect(screen.getByText(/^Page 1 of \d+$/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Next' }));

        await waitFor(() => expect(window.location.search).toBe('?page=2'));
        await waitFor(() =>
            expect(screen.getByText(/^Page 2 of \d+$/)).toBeVisible(),
        );
        await waitFor(() => expect(rows()).toHaveLength(all.total - 25));
    });

    it('goes back to the first page when a filter changes', async () => {
        const user = userEvent.setup();
        await open();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(window.location.search).toBe('?page=2'));
        await user.click(chip('Last 7 days'));

        await waitFor(() => expect(window.location.search).toBe('?days=7'));
    });

    it('describes each entry in words from its structured data', async () => {
        const user = userEvent.setup();
        await open({}, 'u_admin');
        await user.click(
            within(screen.getByRole('group', { name: 'Action' })).getByRole(
                'button',
                { name: 'Staff invited' },
            ),
        );
        await waitFor(() =>
            expect(window.location.search).toBe('?action=invite'),
        );
        await waitFor(() => expect(rows().length).toBeGreaterThan(0));

        const text = rows()
            .map((row) => within(row).getAllByRole('cell')[3].textContent)
            .join('\n');

        expect(text).toMatch(/Invitation sent to newdesk@shifa.example/);
        expect(text).toMatch(/Invitation to locum@shifa.example revoked/);
        expect(text).not.toMatch(/admin\.audit/);
    });

    it('names the patient and doctor of an appointment entry, and never shows a raw key', async () => {
        await open({}, 'u_admin');

        const text = rows()
            .map((row) => within(row).getAllByRole('cell')[3].textContent)
            .join('\n');

        expect(text).toMatch(/, Dr\. [A-Z]/);
        expect(text).not.toMatch(/admin\.audit/);
    });

    it('is shown in Urdu with Urdu actions and details', async () => {
        renderReception(<Audit />, {
            locale: 'ur',
            source: receptionSource('u_admin').source,
        });
        await screen.findByRole('table');

        expect(
            screen.getByRole('heading', { level: 1, name: 'آڈٹ لاگ' }),
        ).toBeVisible();
        expect(screen.getByText('صرف پڑھنے کے لیے')).toBeVisible();
        expect(screen.getByText(/^\d+ اندراجات$/)).toBeVisible();

        const text = rows()
            .map((row) => row.textContent)
            .join('\n');

        expect(text).toMatch(/آج|کل|دن پہلے/);
        expect(text).toContain('سائن اِن');
        expect(text).not.toContain('Signed in');
    });

    it('shows loading, empty and error on request', async () => {
        const { source } = receptionSource('u_admin');
        const first = renderReception(<Audit />, { source, forced: 'loading' });

        expect(
            await screen.findByRole('status', {
                name: 'Loading the audit log',
            }),
        ).toBeVisible();
        first.unmount();

        const second = renderReception(<Audit />, { source, forced: 'empty' });
        expect(
            await screen.findByText('No activity matches these filters'),
        ).toBeVisible();
        second.unmount();

        renderReception(<Audit />, { source, forced: 'error' });
        expect(
            await screen.findByRole('button', { name: 'Retry' }),
        ).toBeVisible();
    });

    it('is refused for anyone but the clinic admin', async () => {
        renderReception(<Audit />, {
            source: receptionSource('u_recep').source,
        });

        expect(
            await screen.findByRole('button', { name: 'Retry' }),
        ).toBeVisible();
    });
});
