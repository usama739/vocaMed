import { Head } from '@inertiajs/react';
import { Lock } from 'lucide-react';
import { type ReactNode } from 'react';
import { AuditTable, CATEGORIES } from '@/components/admin/audit/audit-table';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { FilterBar, Pagination } from '@/components/vocamed/data-table';
import { useUrlParams } from '@/hooks/use-url-params';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { AuditCategory } from '@/lib/data';

const DAYS = [1, 7, 30] as const;
const DEFAULTS = { days: '30', user: '', action: '', page: '1' };

/** One labelled row of filter chips. */
function FilterGroup({
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
            className="flex flex-wrap items-center gap-2.5"
        >
            <span
                aria-hidden="true"
                className="min-w-[90px] text-label font-semibold text-ink"
            >
                {label}
            </span>
            {children}
        </div>
    );
}

export default function Audit() {
    const { t } = useT();
    const [params, setParams] = useUrlParams(DEFAULTS);

    const days = DAYS.find((d) => String(d) === params.days) ?? 30;
    const category = CATEGORIES.find((c) => c === params.action);
    const userId = params.user || undefined;
    const page = Math.max(1, Number.parseInt(params.page, 10) || 1);

    const query = useView(
        'adminAudit',
        { days, userId, category, page },
        {
            refreshMs: 15_000,
            // The table stays on screen while a filter loads.
            keepPrevious: true,
            emptyFrom: (data) => ({ ...data, rows: [], total: 0 }),
        },
    );
    const view = query.data;

    const filter = (patch: Partial<typeof DEFAULTS>) =>
        setParams({ ...patch, page: '1' });
    const clear = () => setParams({ ...DEFAULTS });

    const chip = (
        key: string,
        label: string,
        pressed: boolean,
        onClick: () => void,
    ) => (
        <ChoiceChip key={key} shape="pill" pressed={pressed} onClick={onClick}>
            {label}
        </ChoiceChip>
    );

    const pageCount = view ? Math.ceil(view.total / view.perPage) : 1;

    return (
        <>
            <Head title={t('admin.audit.title')} />
            <PageBody>
                <PageHeader
                    title={t('admin.audit.title')}
                    lead={t('admin.audit.sub')}
                />

                <FilterBar>
                    <FilterGroup label={t('admin.audit.fDate')}>
                        {chip('1', t('admin.audit.today'), days === 1, () =>
                            filter({ days: '1' }),
                        )}
                        {chip('7', t('admin.audit.last7'), days === 7, () =>
                            filter({ days: '7' }),
                        )}
                        {chip('30', t('admin.audit.last30'), days === 30, () =>
                            filter({ days: '30' }),
                        )}
                    </FilterGroup>
                    <FilterGroup label={t('admin.audit.fUser')}>
                        {chip('all', t('admin.audit.all'), !userId, () =>
                            filter({ user: '' }),
                        )}
                        {(view?.users ?? []).map((user) =>
                            chip(user.id, user.name, userId === user.id, () =>
                                filter({ user: user.id }),
                            ),
                        )}
                    </FilterGroup>
                    <FilterGroup label={t('admin.audit.fAction')}>
                        {chip('all', t('admin.audit.all'), !category, () =>
                            filter({ action: '' }),
                        )}
                        {CATEGORIES.map((item: AuditCategory) =>
                            chip(
                                item,
                                t(`admin.audit.categories.${item}`),
                                category === item,
                                () => filter({ action: item }),
                            ),
                        )}
                    </FilterGroup>
                </FilterBar>

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.audit.loading')}
                        blocks={[24, 420]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <span
                                role="status"
                                className="text-[14.5px] font-semibold text-ink"
                            >
                                {t('admin.audit.count', { count: view.total })}
                            </span>
                            <span className="inline-flex items-center gap-2 text-[14px] text-subtle">
                                <Lock aria-hidden="true" className="size-4" />
                                {t('admin.audit.readonly')}
                            </span>
                        </div>

                        <AuditTable
                            rows={view.rows}
                            today={view.today}
                            timezone={view.clinic.timezone}
                            empty={
                                <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
                                    <strong className="text-lead text-ink">
                                        {t('admin.audit.emptyTitle')}
                                    </strong>
                                    <span className="text-control">
                                        {t('admin.audit.emptyBody')}
                                    </span>
                                    <Button variant="outline" onClick={clear}>
                                        {t('admin.audit.clear')}
                                    </Button>
                                </div>
                            }
                        />

                        {view.total > view.perPage && (
                            <Pagination
                                page={view.page}
                                pageCount={pageCount}
                                onPageChange={(next) =>
                                    setParams({ page: String(next) })
                                }
                            />
                        )}
                    </>
                )}
            </PageBody>
        </>
    );
}
