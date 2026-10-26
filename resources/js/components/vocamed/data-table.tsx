import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    MoreHorizontal,
    Search,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    EmptyState,
    ErrorState,
    LoadingState,
} from '@/components/vocamed/states';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

export type Column<T> = {
    key: string;
    header: string;
    cell: (row: T) => ReactNode;
    sortable?: boolean;
    className?: string;
};

export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * The table pattern: native <table> semantics, sortable headers with aria-sort, and the
 * loading / error / empty states built in. Filters and pagination sit around it
 * (`FilterBar`, `Pagination`). Wide tables scroll inside their own frame, never the page.
 */
export function DataTable<T>({
    label,
    columns,
    rows,
    rowKey,
    sort = null,
    onSortChange,
    actions,
    actionsHeader,
    status = 'ready',
    onRetry,
    onClearFilters,
    rowClassName,
    emptyTitle,
    emptyBody,
    className,
}: {
    /** Accessible name of the table. */
    label: string;
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    sort?: SortState;
    onSortChange?: (sort: SortState) => void;
    /** Rendered in a trailing cell: inline buttons or a `RowActionsMenu`. */
    actions?: (row: T) => ReactNode;
    actionsHeader?: string;
    status?: 'ready' | 'loading' | 'error';
    onRetry?: () => void;
    onClearFilters?: () => void;
    /** Extra classes for a row, e.g. the flash on a row that just changed. */
    rowClassName?: (row: T) => string | undefined;
    /** Replace the generic empty-state copy ({@link EmptyState}) with the page's own. */
    emptyTitle?: string;
    emptyBody?: string;
    className?: string;
}) {
    const { t } = useT();

    const toggle = (key: string) => {
        if (!onSortChange) {
            return;
        }

        if (sort?.key !== key) {
            onSortChange({ key, direction: 'asc' });
        } else if (sort.direction === 'asc') {
            onSortChange({ key, direction: 'desc' });
        } else {
            onSortChange(null);
        }
    };

    return (
        <div
            className={cn(
                'overflow-x-auto rounded-xl border border-line',
                className,
            )}
        >
            <table
                aria-label={label}
                className="w-full min-w-[760px] border-collapse"
            >
                <thead>
                    <tr className="border-b border-line bg-surface-subtle">
                        {columns.map((column) => {
                            const active = sort?.key === column.key;
                            const Icon = !active
                                ? ArrowUpDown
                                : sort.direction === 'asc'
                                  ? ArrowUp
                                  : ArrowDown;

                            return (
                                <th
                                    key={column.key}
                                    scope="col"
                                    aria-sort={
                                        active
                                            ? sort.direction === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : column.sortable
                                              ? 'none'
                                              : undefined
                                    }
                                    className={cn(
                                        'px-5 py-1 text-start text-small font-semibold text-subtle',
                                        column.className,
                                    )}
                                >
                                    {column.sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => toggle(column.key)}
                                            title={t('table.sortBy', {
                                                column: column.header,
                                            })}
                                            className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 hover:text-ink"
                                        >
                                            {column.header}
                                            <Icon
                                                aria-hidden="true"
                                                className={cn(
                                                    'size-3.5',
                                                    active && 'text-brand',
                                                )}
                                            />
                                        </button>
                                    ) : (
                                        column.header
                                    )}
                                </th>
                            );
                        })}
                        {actions && (
                            <th
                                scope="col"
                                className="px-5 py-3 text-start text-small font-semibold text-subtle"
                            >
                                {actionsHeader}
                            </th>
                        )}
                    </tr>
                </thead>
                {status === 'ready' && rows.length > 0 && (
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={rowKey(row)}
                                className={cn(
                                    'border-b border-line-soft transition-colors duration-150 last:border-b-0 hover:bg-surface-row',
                                    rowClassName?.(row),
                                )}
                            >
                                {columns.map((column) => (
                                    <td
                                        key={column.key}
                                        className={cn(
                                            'h-[72px] px-5 py-2.5 text-control text-ink',
                                            column.className,
                                        )}
                                    >
                                        {column.cell(row)}
                                    </td>
                                ))}
                                {actions && (
                                    <td className="h-[72px] px-5 py-2.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {actions(row)}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                )}
            </table>

            {status === 'loading' && <LoadingState />}
            {status === 'error' && onRetry && <ErrorState onRetry={onRetry} />}
            {status === 'ready' && rows.length === 0 && (
                <EmptyState
                    title={emptyTitle ?? t('table.emptyTitle')}
                    description={emptyBody ?? t('table.emptyBody')}
                    action={
                        onClearFilters && (
                            <Button variant="outline" onClick={onClearFilters}>
                                {t('table.clearFilters')}
                            </Button>
                        )
                    }
                />
            )}
        </div>
    );
}

/** "12 rows", announced politely when filters change it. */
export function ResultCount({ count }: { count: number }) {
    const { t } = useT();

    return (
        <span role="status" className="text-control font-semibold text-ink">
            {t('table.count', { count })}
        </span>
    );
}

export function Pagination({
    page,
    pageCount,
    onPageChange,
}: {
    /** 1-based. */
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
}) {
    const { t } = useT();

    return (
        <nav
            aria-label={t('table.pages')}
            className="flex flex-wrap items-center justify-between gap-3"
        >
            <span className="text-label">
                {t('table.pageOf', { page, pages: pageCount })}
            </span>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    {t('table.previous')}
                </Button>
                <Button
                    variant="outline"
                    disabled={page >= pageCount}
                    onClick={() => onPageChange(page + 1)}
                >
                    {t('table.next')}
                </Button>
            </div>
        </nav>
    );
}

/** Container for the search box and filter rows that sit above a table. */
export function FilterBar({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3.5 rounded-xl border border-line bg-surface-subtle p-[18px]',
                className,
            )}
        >
            {children}
        </div>
    );
}

export function SearchInput({
    label,
    value,
    onChange,
    id: givenId,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** Lets a page focus the box with its own shortcut. */
    id?: string;
}) {
    const generated = useId();
    const id = givenId ?? generated;

    return (
        <div className="relative">
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3.5 top-[15px] size-[18px] text-subtle"
            />
            <input
                id={id}
                type="search"
                value={value}
                placeholder={label}
                onChange={(event) => onChange(event.target.value)}
                className="h-12 w-full rounded-md border border-line-strong bg-white ps-11 pe-3.5 text-body text-ink placeholder:text-subtle"
            />
        </div>
    );
}

export function FilterRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex flex-wrap items-center gap-2"
        >
            <span
                aria-hidden="true"
                className="min-w-20 text-label font-semibold text-ink"
            >
                {label}
            </span>
            {children}
        </div>
    );
}

/** A "⋯" menu for rows with more actions than fit inline. */
export function RowActionsMenu({
    items,
}: {
    items: {
        label: string;
        onSelect: () => void;
        destructive?: boolean;
    }[];
}) {
    const { t, locale, dir } = useT();

    return (
        <DropdownMenu dir={dir}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('table.rowActions')}
                >
                    <MoreHorizontal aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                style={{ direction: dir }}
                lang={locale}
                className="w-48"
            >
                {items.map((item) => (
                    <DropdownMenuItem
                        key={item.label}
                        variant={item.destructive ? 'destructive' : 'default'}
                        onSelect={item.onSelect}
                    >
                        {item.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
