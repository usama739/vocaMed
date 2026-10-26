import { Head, Link } from '@inertiajs/react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppointmentPanel } from '@/components/doctor/appointment-panel';
import { nextPatient } from '@/components/doctor/next-patient';
import { formatLongDate } from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { SummaryStrip } from '@/components/reception/stat-card';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { EmptyState } from '@/components/vocamed/states';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useChangedKeys } from '@/hooks/use-changed-keys';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { AppointmentRow, AppointmentStatus } from '@/lib/data';
import { cn } from '@/lib/utils';

/** The row grid: stacked on tablets, one line of four columns from `lg` up. */
const ROW =
    'grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 px-5 py-2.5 lg:min-h-[72px] lg:grid-cols-[80px_minmax(200px,1.6fr)_170px_minmax(200px,1.4fr)]';

export default function DoctorOverview() {
    const { t, locale } = useT();
    const source = useData();
    const { message } = useErrorText();
    const query = useView('doctorOverview', undefined, {
        emptyFrom: (d) => ({ ...d, rows: [], daysAhead: 0 }),
    });
    const [pending, setPending] = useState<string | null>(null);
    // A status saved here shows at once; the next load replaces it with the server's.
    const [overrides, setOverrides] = useState<
        Record<string, AppointmentStatus>
    >({});
    const [announcement, setAnnouncement] = useState('');
    const [selected, setSelected] = useState<AppointmentRow | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const data = query.data;

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverrides({});
    }, [data]);

    const rows = useMemo(
        () =>
            (data?.rows ?? []).map((row) => ({
                ...row,
                appointment: {
                    ...row.appointment,
                    status:
                        overrides[row.appointment.id] ?? row.appointment.status,
                },
            })),
        [data, overrides],
    );
    const changed = useChangedKeys(
        data?.rows,
        (row) => row.appointment.id,
        (row) => row.appointment.status,
    );

    const count = (status: AppointmentStatus) =>
        rows.filter((r) => r.appointment.status === status).length;
    const live = rows.filter((r) => r.appointment.status !== 'cancelled');
    const next = nextPatient(rows);

    const move = async (row: AppointmentRow, to: AppointmentStatus) => {
        const id = row.appointment.id;
        setPending(id);

        try {
            const saved = await source.appointments.setStatus(id, to);
            setOverrides((o) => ({ ...o, [id]: saved.status }));
            setAnnouncement(
                t('doctor.overview.changed', {
                    patient: row.patient.name,
                    status: t(`status.${saved.status}`),
                }),
            );
            query.reload();
        } catch (caught) {
            notify(
                'error',
                message(caught) || t('doctor.overview.changeFailed'),
            );
        } finally {
            setPending(null);
        }
    };

    const clinic = data?.clinic;
    const tz = clinic?.timezone ?? 'UTC';

    /** The one action a row offers, if the server allows it. */
    const action = (row: AppointmentRow) => {
        const { status } = row.appointment;

        if (
            status === 'arrived' &&
            row.allowed.transitions.includes('in_consultation')
        ) {
            return { to: 'in_consultation' as const, kind: 'start' as const };
        }

        if (
            status === 'in_consultation' &&
            row.allowed.transitions.includes('done')
        ) {
            return { to: 'done' as const, kind: 'done' as const };
        }

        return null;
    };

    const nextAction = next ? action(next) : null;

    return (
        <>
            <Head title={t('doctor.overview.title')} />
            <PageBody>
                <PageHeader
                    title={t('doctor.overview.title')}
                    lead={
                        data
                            ? t('doctor.overview.lead', {
                                  date: formatLongDate(data.today, locale),
                                  doctor: data.doctor.name,
                              })
                            : ' '
                    }
                    actions={
                        <Button variant="outline" asChild>
                            <Link
                                href="/doctor/requests"
                                aria-label={t('doctor.overview.requestsAria', {
                                    count: data?.pendingRequests ?? 0,
                                })}
                            >
                                {t('doctor.overview.requests')}
                                {(data?.pendingRequests ?? 0) > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className="inline-flex min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-label font-bold text-white"
                                    >
                                        {data?.pendingRequests}
                                    </span>
                                )}
                            </Link>
                        </Button>
                    }
                />

                <p role="status" className="sr-only">
                    {announcement}
                </p>

                {query.status === 'loading' && (
                    <PageLoading label={t('doctor.overview.loading')} />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && (
                    <>
                        <SummaryStrip
                            label={t('doctor.overview.summary')}
                            items={[
                                {
                                    key: 'total',
                                    label: t('doctor.overview.total'),
                                    value: live.length,
                                },
                                {
                                    key: 'waiting',
                                    label: t('doctor.overview.waiting'),
                                    value: count('arrived'),
                                },
                                {
                                    key: 'consult',
                                    label: t('doctor.overview.consult'),
                                    value: count('in_consultation'),
                                },
                                {
                                    key: 'ahead',
                                    label: t('doctor.overview.upcoming'),
                                    value: data.daysAhead,
                                },
                            ]}
                        />

                        {next ? (
                            <section
                                aria-labelledby="next-patient"
                                key={`${next.appointment.id}-${next.appointment.status}`}
                                className="flex animate-fade flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-brand bg-[#f3f8ff] p-5 motion-reduce:animate-none"
                            >
                                <div className="flex flex-col gap-1">
                                    <h2
                                        id="next-patient"
                                        className="text-label font-bold tracking-[0.04em] text-brand-deep uppercase"
                                    >
                                        {t('doctor.overview.next')}
                                    </h2>
                                    <span className="text-[22px] font-bold text-ink">
                                        {next.patient.name}
                                    </span>
                                    <span className="text-control">
                                        <span dir="ltr">
                                            {formatClock(
                                                next.appointment.startsAt,
                                                tz,
                                            )}
                                        </span>
                                        {' · '}
                                        {next.service.name}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <StatusBadge
                                        status={next.appointment.status}
                                    />
                                    <Button
                                        size="lg"
                                        disabled={
                                            !nextAction || pending !== null
                                        }
                                        onClick={() =>
                                            nextAction &&
                                            move(next, nextAction.to)
                                        }
                                    >
                                        {pending === next.appointment.id && (
                                            <Loader2
                                                aria-hidden="true"
                                                className="animate-spin motion-reduce:animate-none"
                                            />
                                        )}
                                        {nextAction
                                            ? nextAction.kind === 'done'
                                                ? t('doctor.overview.done')
                                                : t('doctor.overview.callIn')
                                            : t('doctor.overview.notArrived')}
                                    </Button>
                                </div>
                            </section>
                        ) : rows.length > 0 ? (
                            <div
                                role="status"
                                className="rounded-xl border border-line p-6 text-center text-body font-semibold text-ink"
                            >
                                {t('doctor.overview.allDone')}
                            </div>
                        ) : null}

                        <section
                            aria-labelledby="todays-appointments"
                            className="animate-rise overflow-hidden rounded-xl border border-line bg-white motion-reduce:animate-none"
                        >
                            <h2
                                id="todays-appointments"
                                className="border-b border-line bg-surface-subtle px-5 py-4 text-lead font-semibold text-ink"
                            >
                                {t('doctor.overview.today')}
                            </h2>
                            {rows.length === 0 ? (
                                <EmptyState
                                    icon={CalendarDays}
                                    title={t('doctor.overview.emptyTitle')}
                                    description={t('doctor.overview.emptyBody')}
                                    action={
                                        <Button variant="outline" asChild>
                                            <Link href="/doctor/schedule">
                                                {t(
                                                    'doctor.overview.toSchedule',
                                                )}
                                            </Link>
                                        </Button>
                                    }
                                />
                            ) : (
                                <ul>
                                    {rows.map((row) => {
                                        const act = action(row);

                                        return (
                                            <li
                                                key={row.appointment.id}
                                                data-appointment={
                                                    row.appointment.id
                                                }
                                                data-status={
                                                    row.appointment.status
                                                }
                                                className={cn(
                                                    ROW,
                                                    'border-b border-line-soft transition-colors duration-150 last:border-b-0 hover:bg-surface-row',
                                                    changed.has(
                                                        row.appointment.id,
                                                    ) && 'animate-flash',
                                                    row.appointment.status ===
                                                        'cancelled' &&
                                                        'opacity-70',
                                                )}
                                            >
                                                <span
                                                    dir="ltr"
                                                    className="text-start text-body font-bold text-ink"
                                                >
                                                    {formatClock(
                                                        row.appointment
                                                            .startsAt,
                                                        tz,
                                                    )}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={t(
                                                        'doctor.overview.openAria',
                                                        {
                                                            patient:
                                                                row.patient
                                                                    .name,
                                                        },
                                                    )}
                                                    onClick={() => {
                                                        setSelected(row);
                                                        setPanelOpen(true);
                                                    }}
                                                    className="flex min-h-11 min-w-0 flex-col justify-center text-start leading-[1.4] hover:text-brand-hover"
                                                >
                                                    <span className="truncate text-control font-semibold text-ink">
                                                        {row.patient.name}
                                                    </span>
                                                    <span className="truncate text-label">
                                                        {row.service.name}
                                                    </span>
                                                </button>
                                                <div className="col-span-2 lg:col-span-1">
                                                    <StatusBadge
                                                        status={
                                                            row.appointment
                                                                .status
                                                        }
                                                    />
                                                </div>
                                                <div className="col-span-2 flex flex-wrap gap-2 lg:col-span-1">
                                                    {act && (
                                                        <Button
                                                            variant={
                                                                act.kind ===
                                                                'done'
                                                                    ? 'default'
                                                                    : 'outline'
                                                            }
                                                            size="sm"
                                                            disabled={
                                                                pending !== null
                                                            }
                                                            aria-label={t(
                                                                act.kind ===
                                                                    'done'
                                                                    ? 'doctor.overview.doneAria'
                                                                    : 'doctor.overview.startAria',
                                                                {
                                                                    patient:
                                                                        row
                                                                            .patient
                                                                            .name,
                                                                },
                                                            )}
                                                            onClick={() =>
                                                                move(
                                                                    row,
                                                                    act.to,
                                                                )
                                                            }
                                                            className={
                                                                act.kind ===
                                                                'start'
                                                                    ? 'border-brand text-brand-deep'
                                                                    : undefined
                                                            }
                                                        >
                                                            {pending ===
                                                                row.appointment
                                                                    .id && (
                                                                <Loader2
                                                                    aria-hidden="true"
                                                                    className="animate-spin motion-reduce:animate-none"
                                                                />
                                                            )}
                                                            {act.kind === 'done'
                                                                ? t(
                                                                      'doctor.overview.done',
                                                                  )
                                                                : t(
                                                                      'doctor.overview.start',
                                                                  )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </>
                )}

                <p className="text-label text-subtle">
                    {t('doctor.overview.note')} · {t('common.sample')}
                </p>
                <SampleNote className="sr-only" />
            </PageBody>

            {clinic && data && (
                <AppointmentPanel
                    row={selected}
                    clinic={clinic}
                    today={data.today}
                    open={panelOpen}
                    onOpenChange={setPanelOpen}
                />
            )}
        </>
    );
}
