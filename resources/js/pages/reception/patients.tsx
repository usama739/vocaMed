import { Head, Link } from '@inertiajs/react';
import { Plus, Search, UserRoundX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    formatPhone,
    localDate,
    relativeDay,
    todayIn,
} from '@/components/reception/format';
import { NewPatientDialog } from '@/components/reception/new-patient-dialog';
import {
    Card,
    PageBody,
    PageError,
    PageHeader,
    PatientAvatar,
    SampleNote,
} from '@/components/reception/page-parts';
import {
    loadPatientRows,
    type PatientRow,
} from '@/components/reception/queries';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/vocamed/data-table';
import { EmptyState } from '@/components/vocamed/states';
import { notify } from '@/components/vocamed/toast';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useShortcut } from '@/hooks/use-shortcut';
import { useUrlParams } from '@/hooks/use-url-params';
import { useT } from '@/i18n/scope';

export default function Patients() {
    const { t } = useT();
    const [{ q }, setParams] = useUrlParams({ q: '' });
    const [debounced, setDebounced] = useState(q.trim());
    const [createOpen, setCreateOpen] = useState(false);
    const [added, setAdded] = useState<PatientRow[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(q.trim()), 250);

        return () => window.clearTimeout(timer);
    }, [q]);

    // On this page "/" searches patients here, not in the sidebar.
    useShortcut('/', () => inputRef.current?.focus());

    const query = useLiveQuery(
        `patients:${debounced}`,
        (source) => loadPatientRows(source, debounced),
        { keepPrevious: true, refreshMs: 0, empty: [] },
    );
    const clinic = useLiveQuery('clinic', (source) => source.clinic.get(), {
        refreshMs: 0,
    }).data;

    const rows = useMemo(() => {
        const loaded = query.data ?? [];

        // A patient just added stays on top of the recent list, so they can be opened at once.
        return debounced
            ? loaded
            : [
                  ...added,
                  ...loaded.filter(
                      (r) => !added.some((a) => a.patient.id === r.patient.id),
                  ),
              ];
    }, [query.data, added, debounced]);

    const today = clinic ? todayIn(clinic.timezone) : null;
    const when = (iso: string | null, empty: string) => {
        if (!iso || !clinic || !today) {
            return empty;
        }

        const { key, count } = relativeDay(
            localDate(iso, clinic.timezone),
            today,
        );

        return t(`reception.day.${key}`, { count });
    };

    const columns: Column<PatientRow>[] = [
        {
            key: 'name',
            header: t('reception.patients.colName'),
            cell: ({ patient }) => (
                <span className="flex items-center gap-3">
                    <PatientAvatar name={patient.name} />
                    <span className="text-control font-semibold text-ink">
                        {patient.name}
                    </span>
                </span>
            ),
        },
        {
            key: 'phone',
            header: t('reception.patients.colPhone'),
            cell: ({ patient }) =>
                patient.phone ? (
                    <span dir="ltr" className="block text-start">
                        {formatPhone(patient.phone, clinic?.phoneCountryCode)}
                    </span>
                ) : (
                    <span className="text-label text-subtle">
                        {t('reception.noPhone')}
                    </span>
                ),
        },
        {
            key: 'last',
            header: t('reception.patients.colLast'),
            cell: (row) => (
                <span className="text-label">
                    {when(row.lastVisit, t('reception.patients.never'))}
                </span>
            ),
        },
        {
            key: 'next',
            header: t('reception.patients.colNext'),
            cell: (row) => (
                <span className="text-label text-ink">
                    {when(row.next, t('reception.patients.none'))}
                </span>
            ),
        },
    ];

    const openCreate = () => setCreateOpen(true);
    const initialPhone = q.replace(/[^0-9 ]/g, '').trim();

    return (
        <>
            <Head title={t('reception.patients.title')} />
            <PageBody>
                <PageHeader
                    title={t('reception.patients.title')}
                    lead={t('reception.patients.sub')}
                    actions={
                        <Button onClick={openCreate}>
                            <Plus aria-hidden="true" />
                            {t('reception.patients.add')}
                        </Button>
                    }
                />

                <div className="group relative">
                    <label htmlFor="patient-search" className="sr-only">
                        {t('reception.patients.search')}
                    </label>
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute start-4 top-[19px] size-5 text-subtle transition-colors group-focus-within:text-brand"
                    />
                    <input
                        id="patient-search"
                        ref={inputRef}
                        type="search"
                        inputMode="tel"
                        value={q}
                        autoComplete="off"
                        placeholder={t('reception.patients.search')}
                        onChange={(event) =>
                            setParams({ q: event.target.value })
                        }
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && q) {
                                setParams({ q: '' });
                            }
                        }}
                        className="h-[58px] w-full rounded-lg border-2 border-line-strong bg-white ps-12 pe-4 text-lead text-ink transition-colors placeholder:text-subtle focus-visible:border-brand"
                    />
                </div>

                <h2 className="text-body font-semibold text-ink">
                    {debounced
                        ? t('reception.patients.results')
                        : t('reception.patients.recent')}
                </h2>

                {query.status === 'error' ? (
                    <PageError onRetry={query.reload} />
                ) : query.status === 'loading' ? (
                    <DataTable
                        label={t('reception.patients.title')}
                        columns={columns}
                        rows={[]}
                        rowKey={(row) => row.patient.id}
                        status="loading"
                    />
                ) : rows.length === 0 ? (
                    <Card>
                        <EmptyState
                            icon={UserRoundX}
                            title={t('reception.patients.emptyTitle')}
                            description={t('reception.patients.emptyBody')}
                            action={
                                <Button onClick={openCreate}>
                                    <Plus aria-hidden="true" />
                                    {t('reception.patients.add')}
                                </Button>
                            }
                        />
                    </Card>
                ) : (
                    <DataTable
                        label={t('reception.patients.title')}
                        columns={columns}
                        rows={rows}
                        rowKey={(row) => row.patient.id}
                        actions={({ patient }) => (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={`/reception/patients/${patient.id}`}
                                    aria-label={t(
                                        'reception.patients.openAria',
                                        {
                                            name: patient.name,
                                        },
                                    )}
                                >
                                    {t('reception.patients.open')}
                                </Link>
                            </Button>
                        )}
                        rowClassName={({ patient }) =>
                            added.some((a) => a.patient.id === patient.id)
                                ? 'animate-flash'
                                : undefined
                        }
                    />
                )}

                <SampleNote />
            </PageBody>

            <NewPatientDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                initialPhone={initialPhone}
                onSaved={(patient) => {
                    setAdded((list) => [
                        { patient, lastVisit: null, next: null },
                        ...list,
                    ]);
                    setParams({ q: '' });
                    notify(
                        'success',
                        t('reception.patients.added', { name: patient.name }),
                    );
                    query.reload();
                }}
            />
        </>
    );
}
