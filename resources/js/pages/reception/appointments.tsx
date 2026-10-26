import { Head, Link } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    addDaysToDate,
    formatPhone,
    localDate,
    relativeDay,
    todayIn,
} from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageHeader,
    SampleNote,
} from '@/components/reception/page-parts';
import { loadRows, type Row } from '@/components/reception/queries';
import { useReception } from '@/components/reception/runtime';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import {
    DataTable,
    FilterBar,
    FilterRow,
    Pagination,
    SearchInput,
    type Column,
    type SortState,
} from '@/components/vocamed/data-table';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useChangedKeys } from '@/hooks/use-changed-keys';
import { useData } from '@/hooks/use-data';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useShortcut } from '@/hooks/use-shortcut';
import { useUrlParams } from '@/hooks/use-url-params';
import { useT } from '@/i18n/scope';
import {
    isOpenStatus,
    type AppointmentQuery,
    type AppointmentStatus,
} from '@/lib/data';

const PER_PAGE = 10;
const STATUSES: AppointmentStatus[] = [
    'booked',
    'confirmed',
    'arrived',
    'in_consultation',
    'done',
    'cancelled',
    'no_show',
];
const DATE_FILTERS = ['any', 'today', 'next7', 'past7'] as const;
type DateFilter = (typeof DATE_FILTERS)[number];

const DEFAULTS = {
    q: '',
    when: 'any',
    doctor: 'all',
    status: 'all',
    page: '1',
    sort: 'desc',
};

export default function Appointments() {
    const { t } = useT();
    const source = useData();
    const { openReschedule, refresh } = useReception();
    const [params, setParams] = useUrlParams(DEFAULTS);
    const [typed, setTyped] = useState(params.q);
    const [debounced, setDebounced] = useState(params.q.trim());
    const [cancelling, setCancelling] = useState<Row | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebounced(typed.trim());

            if (typed !== params.q) {
                setParams({ q: typed, page: '1' });
            }
        }, 250);

        return () => window.clearTimeout(timer);
        // Only the typed text drives this; `params.q` follows it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typed]);

    useShortcut('/', () =>
        document.getElementById('appointment-search')?.focus(),
    );

    const setup = useLiveQuery(
        'appointments-setup',
        async (s) => {
            const [clinic, doctors] = await Promise.all([
                s.clinic.get(),
                s.doctors.list(),
            ]);

            return { clinic, doctors };
        },
        { refreshMs: 0 },
    ).data;
    const today = setup ? todayIn(setup.clinic.timezone) : null;
    const when = (DATE_FILTERS as readonly string[]).includes(params.when)
        ? (params.when as DateFilter)
        : 'any';
    const page = Math.max(1, Number(params.page) || 1);
    const direction = params.sort === 'asc' ? 'asc' : 'desc';

    const filters: AppointmentQuery | null = useMemo(() => {
        if (!today) {
            return null;
        }

        const range =
            when === 'today'
                ? { from: today, to: today }
                : when === 'next7'
                  ? { from: today, to: addDaysToDate(today, 7) }
                  : when === 'past7'
                    ? {
                          from: addDaysToDate(today, -7),
                          to: addDaysToDate(today, -1),
                      }
                    : {};

        return {
            ...range,
            ...(params.doctor !== 'all' ? { doctorId: params.doctor } : {}),
            ...(params.status !== 'all'
                ? { status: params.status as AppointmentStatus }
                : {}),
            ...(debounced ? { patient: debounced } : {}),
            sort: direction === 'asc' ? 'startsAt' : '-startsAt',
            page,
            perPage: PER_PAGE,
        };
    }, [today, when, params.doctor, params.status, debounced, direction, page]);

    const query = useLiveQuery(
        `appointments:${JSON.stringify(filters)}`,
        (s) => (filters ? loadRows(s, filters) : Promise.resolve(null)),
        {
            keepPrevious: true,
            emptyFrom: (page) =>
                page ? { ...page, items: [], total: 0 } : page,
        },
    );
    const result = query.data ?? undefined;
    const rows = result?.items ?? [];
    const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / PER_PAGE));
    const changed = useChangedKeys(
        rows,
        (r) => r.appointment.id,
        (r) => r.appointment.status + r.appointment.startsAt,
    );

    const filtered =
        debounced !== '' ||
        when !== 'any' ||
        params.doctor !== 'all' ||
        params.status !== 'all';
    const reset = () => {
        setTyped('');
        setDebounced('');
        setParams({ ...DEFAULTS });
    };
    const change = (patch: Partial<typeof DEFAULTS>) =>
        setParams({ ...patch, page: '1' });

    const whenLabel = (row: Row) => {
        if (!setup || !today) {
            return null;
        }

        const date = localDate(row.appointment.startsAt, setup.clinic.timezone);
        const { key, count } = relativeDay(date, today);

        return {
            day: t(`reception.day.${key}`, { count }),
            time: formatClock(row.appointment.startsAt, setup.clinic.timezone),
        };
    };

    const columns: Column<Row>[] = [
        {
            key: 'when',
            header: t('reception.appointments.colWhen'),
            sortable: true,
            className: 'w-[150px]',
            cell: (row) => {
                const label = whenLabel(row);

                return (
                    <span className="flex flex-col leading-[1.4]">
                        <span className="text-label font-semibold text-ink">
                            {label?.day}
                        </span>
                        <span dir="ltr" className="text-start text-small">
                            {label?.time}
                        </span>
                    </span>
                );
            },
        },
        {
            key: 'patient',
            header: t('reception.appointments.colPatient'),
            cell: ({ patient }) => (
                <span className="flex min-w-0 flex-col leading-[1.4]">
                    <span className="truncate text-control font-semibold text-ink">
                        {patient.name}
                    </span>
                    <span dir="ltr" className="text-start text-small">
                        {patient.phone
                            ? formatPhone(
                                  patient.phone,
                                  setup?.clinic.phoneCountryCode,
                              )
                            : t('reception.noPhone')}
                    </span>
                </span>
            ),
        },
        {
            key: 'doctor',
            header: t('reception.appointments.colDoctor'),
            cell: ({ doctor }) => doctor.name,
        },
        {
            key: 'status',
            header: t('reception.appointments.colStatus'),
            cell: ({ appointment }) => (
                <StatusBadge status={appointment.status} />
            ),
        },
    ];

    const sort: SortState = { key: 'when', direction };

    const cancel = async () => {
        if (!cancelling) {
            return;
        }

        try {
            await source.appointments.cancel(cancelling.appointment.id);
            notify('success', t('reception.appointments.cancelled'));
            query.reload();
            refresh();
        } catch {
            notify('error', t('reception.appointments.cancelFailed'));
        }
    };

    const chip = (key: keyof typeof DEFAULTS, value: string, label: string) => (
        <ChoiceChip
            key={value}
            shape="pill"
            pressed={params[key] === value}
            onClick={() => change({ [key]: value })}
        >
            {label}
        </ChoiceChip>
    );

    return (
        <>
            <Head title={t('reception.appointments.title')} />
            <PageBody>
                <PageHeader
                    title={t('reception.appointments.title')}
                    lead={t('reception.appointments.sub')}
                    actions={
                        <Button
                            variant="outline"
                            onClick={() =>
                                notify(
                                    'info',
                                    t('reception.appointments.csvNotice'),
                                )
                            }
                        >
                            <Download aria-hidden="true" />
                            {t('reception.appointments.csv')}
                            <span className="rounded-full bg-surface-hover px-2 text-caption font-bold text-ink-soft">
                                P2
                            </span>
                        </Button>
                    }
                />

                <FilterBar>
                    <SearchInput
                        label={t('reception.appointments.search')}
                        value={typed}
                        onChange={setTyped}
                        id="appointment-search"
                    />
                    <FilterRow label={t('reception.appointments.date')}>
                        {chip('when', 'any', t('reception.appointments.any'))}
                        {chip('when', 'today', t('reception.day.today'))}
                        {chip(
                            'when',
                            'next7',
                            t('reception.appointments.next7'),
                        )}
                        {chip(
                            'when',
                            'past7',
                            t('reception.appointments.past7'),
                        )}
                    </FilterRow>
                    <FilterRow label={t('reception.appointments.doctor')}>
                        {chip('doctor', 'all', t('reception.appointments.all'))}
                        {(setup?.doctors ?? []).map((doctor) =>
                            chip('doctor', doctor.id, doctor.name),
                        )}
                    </FilterRow>
                    <FilterRow label={t('reception.appointments.status')}>
                        {chip('status', 'all', t('reception.appointments.all'))}
                        {STATUSES.map((status) =>
                            chip('status', status, t(`status.${status}`)),
                        )}
                    </FilterRow>
                </FilterBar>

                <span
                    key={result?.total}
                    role="status"
                    className="inline-block w-fit animate-bump text-control font-semibold text-ink motion-reduce:animate-none"
                >
                    {t('reception.appointments.count', {
                        count: result?.total ?? 0,
                    })}
                </span>

                {query.status === 'error' ? (
                    <PageError onRetry={query.reload} />
                ) : (
                    <div
                        key={JSON.stringify([
                            when,
                            params.doctor,
                            params.status,
                            debounced,
                        ])}
                        className="animate-fade motion-reduce:animate-none"
                    >
                        <DataTable
                            label={t('reception.appointments.title')}
                            columns={columns}
                            rows={rows}
                            rowKey={(row) => row.appointment.id}
                            status={
                                query.status === 'loading' ? 'loading' : 'ready'
                            }
                            sort={sort}
                            // The list is always sorted by When: a click flips the direction.
                            onSortChange={() =>
                                setParams({
                                    sort: direction === 'desc' ? 'asc' : 'desc',
                                    page: '1',
                                })
                            }
                            actionsHeader={t(
                                'reception.appointments.colActions',
                            )}
                            emptyTitle={t('reception.appointments.emptyTitle')}
                            emptyBody={t('reception.appointments.emptyBody')}
                            onClearFilters={filtered ? reset : undefined}
                            rowClassName={(row) =>
                                changed.has(row.appointment.id)
                                    ? 'animate-flash'
                                    : row.appointment.status === 'cancelled'
                                      ? 'opacity-70'
                                      : undefined
                            }
                            actions={(row) => {
                                const label = whenLabel(row);

                                return (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                        >
                                            <Link
                                                href={`/reception/appointments/${row.appointment.id}`}
                                                aria-label={t(
                                                    'reception.appointments.view_aria',
                                                    {
                                                        patient:
                                                            row.patient.name,
                                                        when: `${label?.day} ${label?.time}`,
                                                    },
                                                )}
                                            >
                                                {t(
                                                    'reception.appointments.view',
                                                )}
                                            </Link>
                                        </Button>
                                        {isOpenStatus(
                                            row.appointment.status,
                                        ) && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    aria-label={t(
                                                        'reception.appointments.rescheduleAria',
                                                        {
                                                            patient:
                                                                row.patient
                                                                    .name,
                                                        },
                                                    )}
                                                    onClick={() =>
                                                        openReschedule(
                                                            row.appointment,
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'reception.appointments.reschedule',
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="outline-destructive"
                                                    size="sm"
                                                    aria-label={t(
                                                        'reception.appointments.cancelAria',
                                                        {
                                                            patient:
                                                                row.patient
                                                                    .name,
                                                        },
                                                    )}
                                                    onClick={() =>
                                                        setCancelling(row)
                                                    }
                                                >
                                                    {t(
                                                        'reception.appointments.cancel',
                                                    )}
                                                </Button>
                                            </>
                                        )}
                                    </>
                                );
                            }}
                        />
                    </div>
                )}

                <Pagination
                    page={Math.min(page, pageCount)}
                    pageCount={pageCount}
                    onPageChange={(next) => setParams({ page: String(next) })}
                />
                <SampleNote />
            </PageBody>

            <ConfirmDialog
                open={cancelling !== null}
                onOpenChange={(open) => !open && setCancelling(null)}
                title={t('reception.appointments.cancelTitle', {
                    name: cancelling?.patient.name ?? '',
                })}
                description={t('reception.appointments.cancelText')}
                confirmLabel={t('reception.appointments.cancelYes')}
                cancelLabel={t('reception.appointments.keep')}
                onConfirm={cancel}
            />
        </>
    );
}
