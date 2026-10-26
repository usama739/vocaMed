import { Head } from '@inertiajs/react';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
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
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import {
    DataTable,
    Pagination,
    type Column,
} from '@/components/vocamed/data-table';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useChangedKeys } from '@/hooks/use-changed-keys';
import { useData } from '@/hooks/use-data';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useUrlParams } from '@/hooks/use-url-params';
import { useT } from '@/i18n/scope';
import type {
    DataSource,
    NotificationLogEntry,
    NotificationStatus,
    Patient,
} from '@/lib/data';

const PER_PAGE = 20;
const STATUSES: NotificationStatus[] = [
    'queued',
    'sent',
    'delivered',
    'failed',
];

type LogRow = { entry: NotificationLogEntry; patient: Patient | undefined };

async function loadLog(source: DataSource) {
    const [clinic, entries] = await Promise.all([
        source.clinic.get(),
        source.notifications.list(),
    ]);
    const ids = [...new Set(entries.map((e) => e.patientId))];
    const patients = await Promise.all(
        ids.map((id) => source.patients.get(id).catch(() => undefined)),
    );
    const rows: LogRow[] = entries.map((entry) => ({
        entry,
        patient: patients.find((p) => p?.id === entry.patientId),
    }));

    return { clinic, rows };
}

export default function Notifications() {
    const { t } = useT();
    const source = useData();
    const [params, setParams] = useUrlParams({ status: 'all', page: '1' });
    const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
    const [resending, setResending] = useState<string | null>(null);

    const query = useLiveQuery('notifications', loadLog, {
        emptyFrom: (d) => ({ ...d, rows: [] }),
    });
    const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
    const clinic = query.data?.clinic;
    const today = clinic ? todayIn(clinic.timezone) : null;

    const changed = useChangedKeys(
        rows,
        (r) => r.entry.id,
        (r) => r.entry.status,
    );

    const count = (status: NotificationStatus) =>
        rows.filter((r) => r.entry.status === status).length;
    const unresolved = rows.filter(
        (r) => r.entry.status === 'failed' && !r.entry.resentAt,
    ).length;

    const status = [...STATUSES, 'all'].includes(params.status)
        ? params.status
        : 'all';
    const filtered = rows.filter(
        (r) => status === 'all' || r.entry.status === status,
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
    const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const resend = async (row: LogRow) => {
        setResending(row.entry.id);

        try {
            const next = await source.notifications.resend(row.entry.id);
            setFresh((ids) => new Set([...ids, next.id]));
            notify(
                'success',
                t('reception.notifications.resentToast', {
                    name: row.patient?.name ?? '',
                }),
            );
            query.reload();
        } catch {
            notify('error', t('reception.notifications.resendFailed'));
        } finally {
            setResending(null);
        }
    };

    const columns: Column<LogRow>[] = [
        {
            key: 'when',
            header: t('reception.notifications.colTime'),
            className: 'w-[140px]',
            cell: ({ entry }) => {
                if (!clinic || !today) {
                    return null;
                }

                const { key, count: n } = relativeDay(
                    localDate(entry.createdAt, clinic.timezone),
                    today,
                );

                return (
                    <span className="flex flex-col leading-[1.4]">
                        <span className="text-label font-semibold text-ink">
                            {t(`reception.day.${key}`, { count: n })}
                        </span>
                        <span dir="ltr" className="text-start text-small">
                            {formatClock(entry.createdAt, clinic.timezone)}
                        </span>
                    </span>
                );
            },
        },
        {
            key: 'patient',
            header: t('reception.notifications.colPatient'),
            cell: ({ patient }) => (
                <span className="flex flex-col leading-[1.4]">
                    <span className="text-control font-semibold text-ink">
                        {patient?.name}
                    </span>
                    <span dir="ltr" className="text-start text-small">
                        {patient?.phone
                            ? formatPhone(
                                  patient.phone,
                                  clinic?.phoneCountryCode,
                              )
                            : t('reception.noPhone')}
                    </span>
                </span>
            ),
        },
        {
            key: 'channel',
            header: t('reception.notifications.colChannel'),
            cell: ({ entry }) => t(`channel.${entry.channel}`),
        },
        {
            key: 'message',
            header: t('reception.notifications.colMessage'),
            cell: ({ entry }) => (
                <span className="flex flex-col leading-[1.4]">
                    <span>{t(`reception.kind.${entry.kind}`)}</span>
                    {entry.status === 'failed' && entry.failureReason && (
                        <span className="text-small text-danger-deep">
                            {t(`reception.failure.${entry.failureReason}`)}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: 'status',
            header: t('reception.notifications.colStatus'),
            cell: ({ entry }) => <StatusBadge status={entry.status} />,
        },
    ];

    const chips: { key: string; label: string; count: number }[] = [
        {
            key: 'all',
            label: t('reception.notifications.all'),
            count: rows.length,
        },
        ...STATUSES.map((s) => ({
            key: s,
            label: t(`notificationStatus.${s}`),
            count: count(s),
        })),
    ];

    return (
        <>
            <Head title={t('reception.notifications.title')} />
            <PageBody>
                <PageHeader
                    title={t('reception.notifications.title')}
                    lead={t('reception.notifications.sub')}
                />

                {unresolved > 0 && (
                    <div
                        role="alert"
                        className="flex animate-rise flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-surface px-[18px] py-3.5 text-control font-semibold text-danger-deep motion-reduce:animate-none"
                    >
                        <span className="inline-flex items-center gap-2.5">
                            <TriangleAlert
                                aria-hidden="true"
                                className="size-[18px]"
                            />
                            {t('reception.notifications.failedBanner', {
                                count: unresolved,
                            })}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setParams({ status: 'failed', page: '1' })
                            }
                        >
                            {t('reception.notifications.showFailed')}
                        </Button>
                    </div>
                )}

                <div
                    role="group"
                    aria-label={t('reception.notifications.filter')}
                    className="flex flex-wrap items-center gap-2"
                >
                    {chips.map((chip) => (
                        <ChoiceChip
                            key={chip.key}
                            shape="pill"
                            pressed={status === chip.key}
                            onClick={() =>
                                setParams({ status: chip.key, page: '1' })
                            }
                        >
                            {chip.label}{' '}
                            <span
                                key={chip.count}
                                dir="ltr"
                                className="inline-block animate-bump motion-reduce:animate-none"
                            >
                                ({chip.count})
                            </span>
                        </ChoiceChip>
                    ))}
                </div>

                {query.status === 'error' ? (
                    <PageError onRetry={query.reload} />
                ) : (
                    <div
                        key={status}
                        className="animate-fade motion-reduce:animate-none"
                    >
                        <DataTable
                            label={t('reception.notifications.title')}
                            columns={columns}
                            rows={visible}
                            rowKey={(row) => row.entry.id}
                            status={
                                query.status === 'loading' ? 'loading' : 'ready'
                            }
                            emptyTitle={t('reception.notifications.emptyTitle')}
                            emptyBody={t('reception.notifications.emptyBody')}
                            actionsHeader=""
                            rowClassName={(row) =>
                                changed.has(row.entry.id) ||
                                fresh.has(row.entry.id)
                                    ? 'animate-flash'
                                    : undefined
                            }
                            actions={(row) =>
                                row.entry.status === 'failed' ? (
                                    row.entry.resentAt ? (
                                        <span className="text-label text-subtle">
                                            {t(
                                                'reception.notifications.resent',
                                            )}
                                        </span>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={
                                                resending === row.entry.id
                                            }
                                            aria-label={t(
                                                'reception.notifications.resendAria',
                                                {
                                                    patient:
                                                        row.patient?.name ?? '',
                                                },
                                            )}
                                            onClick={() => resend(row)}
                                        >
                                            {t(
                                                'reception.notifications.resend',
                                            )}
                                        </Button>
                                    )
                                ) : null
                            }
                        />
                    </div>
                )}

                {filtered.length > PER_PAGE && (
                    <Pagination
                        page={page}
                        pageCount={pageCount}
                        onPageChange={(next) =>
                            setParams({ page: String(next) })
                        }
                    />
                )}
                <SampleNote />
            </PageBody>
        </>
    );
}
