import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderIn } from '@/test/render';
import {
    DataTable,
    Pagination,
    type Column,
    type SortState,
} from './data-table';

type Row = { id: string; name: string };
const rows: Row[] = [
    { id: '1', name: 'Row one' },
    { id: '2', name: 'Row two' },
];
const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', sortable: true, cell: (r) => r.name },
];

describe('DataTable', () => {
    it('uses real table semantics and cycles sort ascending, descending, off', async () => {
        const user = userEvent.setup();

        function Harness() {
            const [sort, setSort] = useState<SortState>(null);

            return (
                <DataTable
                    label="Rows"
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.id}
                    sort={sort}
                    onSortChange={setSort}
                />
            );
        }

        renderIn('en', <Harness />);

        const header = screen.getByRole('columnheader', { name: /Name/ });
        expect(screen.getByRole('table', { name: 'Rows' })).toBeInTheDocument();
        expect(header).toHaveAttribute('aria-sort', 'none');

        await user.click(within(header).getByRole('button'));
        expect(header).toHaveAttribute('aria-sort', 'ascending');
        await user.click(within(header).getByRole('button'));
        expect(header).toHaveAttribute('aria-sort', 'descending');
        await user.click(within(header).getByRole('button'));
        expect(header).toHaveAttribute('aria-sort', 'none');
    });

    it('shows an empty state with a way back, and a retryable error', async () => {
        const user = userEvent.setup();
        const clear = vi.fn();
        const retry = vi.fn();

        const { rerender } = renderIn(
            'en',
            <DataTable
                label="Rows"
                columns={columns}
                rows={[]}
                rowKey={(r) => r.id}
                onClearFilters={clear}
            />,
        );

        expect(screen.getByText('Nothing to show')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Clear filters' }));
        expect(clear).toHaveBeenCalled();

        rerender(
            <DataTable
                label="Rows"
                columns={columns}
                rows={[]}
                rowKey={(r) => r.id}
                status="error"
                onRetry={retry}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(retry).toHaveBeenCalled();
    });

    it('announces loading once, not per skeleton row', () => {
        renderIn(
            'en',
            <DataTable
                label="Rows"
                columns={columns}
                rows={[]}
                rowKey={(r) => r.id}
                status="loading"
            />,
        );

        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
});

describe('Pagination', () => {
    it('disables Previous on the first page and Next on the last, in Urdu too', () => {
        renderIn(
            'ur',
            <Pagination
                page={1}
                pageCount={1}
                onPageChange={() => undefined}
            />,
        );

        expect(screen.getByRole('button', { name: 'پچھلا' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'اگلا' })).toBeDisabled();
        expect(screen.getByText('صفحہ 1 از 1')).toBeInTheDocument();
    });
});
