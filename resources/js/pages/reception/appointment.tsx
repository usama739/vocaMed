import { Head, Link } from '@inertiajs/react';
import {
    CircleCheck,
    Clock,
    Loader2,
    MessageSquare,
    TriangleAlert,
    type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
    formatLongDate,
    formatPhone,
    formatStamp,
    localDate,
} from '@/components/reception/format';
import {
    Card,
    CardTitle,
    NotFoundPanel,
    PageBody,
    PageError,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { toRows } from '@/components/reception/queries';
import { useReception } from '@/components/reception/runtime';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useT } from '@/i18n/scope';
import {
    DataError,
    isOpenStatus,
    type AuditEntry,
    type TimelineItem,
    type User,
} from '@/lib/data';
import { cn } from '@/lib/utils';

export default function AppointmentDetail({ id }: { id: string }) {
    const { t, locale } = useT();
    const source = useData();
    const { openReschedule, refresh } = useReception();
    const [busy, setBusy] = useState<'arrive' | 'resend' | null>(null);
    const [confirming, setConfirming] = useState(false);

    const query = useLiveQuery(
        `appointment:${id}`,
        async (s) => {
            try {
                const appointment = await s.appointments.get(id);
                const [clinic, [row], users, timeline, audit] =
                    await Promise.all([
                        s.clinic.get(),
                        toRows(s, [appointment]),
                        s.users.list(),
                        s.appointments.timeline(id),
                        s.audit.list({ subjectId: id }),
                    ]);

                return { clinic, row, users, timeline, audit };
            } catch (caught) {
                if (
                    caught instanceof DataError &&
                    caught.code === 'NOT_FOUND'
                ) {
                    return null;
                }

                throw caught;
            }
        },
        { refreshMs: 5000 },
    );

    const data = query.data;
    const row = data?.row;
    const clinic = data?.clinic;
    const appointment = row?.appointment;

    const run = async (
        kind: 'arrive' | 'resend',
        work: () => Promise<void>,
    ) => {
        setBusy(kind);

        try {
            await work();
            query.reload();
            refresh();
        } catch {
            notify('error', t('reception.detail.actionFailed'));
        } finally {
            setBusy(null);
        }
    };

    const latestConfirmation = data?.timeline.find(
        (item) => item.type === 'message' && item.entry.kind === 'confirmation',
    );

    const userName = (actorId: string, users: User[]) =>
        actorId === 'patient'
            ? t('reception.detail.patientLink')
            : (users.find((u) => u.id === actorId)?.name ??
              t('reception.detail.system'));

    const history = (audit: AuditEntry[], users: User[]) =>
        audit.map((entry) => {
            const status = String(entry.meta.status ?? '');
            const what =
                entry.action === 'appointment.created'
                    ? t(
                          `reception.detail.audit.created.${String(entry.meta.source ?? 'manual')}` as never,
                      )
                    : entry.action === 'appointment.status_changed'
                      ? status === 'confirmed' && entry.actorId === 'patient'
                          ? t('reception.detail.audit.confirmedByPatient')
                          : status === 'arrived'
                            ? t('reception.detail.audit.arrived')
                            : t('reception.detail.audit.status', {
                                  status: t(`status.${status}` as never),
                              })
                      : entry.action === 'appointment.status_reverted'
                        ? t('reception.detail.audit.reverted', {
                              status: t(`status.${status}` as never),
                          })
                        : entry.action === 'appointment.rescheduled'
                          ? t('reception.detail.audit.rescheduled', {
                                when: clinic
                                    ? `${formatLongDate(localDate(String(entry.meta.to), clinic.timezone), locale)}, ${formatClock(String(entry.meta.to), clinic.timezone)}`
                                    : '',
                            })
                          : entry.action === 'appointment.cancelled'
                            ? t('reception.detail.audit.cancelled')
                            : entry.action === 'appointment.message_resent'
                              ? t('reception.detail.audit.resent')
                              : t('reception.detail.audit.other');

            return {
                id: entry.id,
                what,
                who: userName(entry.actorId, users),
                when: clinic
                    ? formatStamp(entry.at, clinic.timezone, locale)
                    : '',
            };
        });

    return (
        <>
            <Head title={t('reception.detail.title')} />
            <PageBody>
                {query.status === 'loading' && (
                    <PageLoading
                        label={t('states.loading')}
                        blocks={[72, 320, 220]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}
                {query.status === 'ready' && data === null && (
                    <NotFoundPanel
                        title={t('reception.detail.notFoundTitle')}
                        body={t('reception.detail.notFoundBody')}
                        backHref="/reception/appointments"
                        backLabel={t('reception.notFoundBack')}
                    />
                )}

                {query.status === 'ready' &&
                    data &&
                    row &&
                    appointment &&
                    clinic && (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex flex-col gap-2.5">
                                    <h1 className="text-heading font-bold text-ink">
                                        {t('reception.detail.title')}
                                    </h1>
                                    <div>
                                        <StatusBadge
                                            status={appointment.status}
                                        />
                                    </div>
                                </div>
                                {isOpenStatus(appointment.status) && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={busy !== null}
                                            onClick={() =>
                                                run('arrive', async () => {
                                                    await source.appointments.setStatus(
                                                        appointment.id,
                                                        'arrived',
                                                    );
                                                    notify(
                                                        'success',
                                                        t(
                                                            'reception.detail.arrivedToast',
                                                        ),
                                                    );
                                                })
                                            }
                                        >
                                            {busy === 'arrive' && (
                                                <Loader2
                                                    aria-hidden="true"
                                                    className="animate-spin motion-reduce:animate-none"
                                                />
                                            )}
                                            {t('reception.detail.arrive')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={
                                                busy !== null ||
                                                !latestConfirmation
                                            }
                                            title={
                                                latestConfirmation
                                                    ? undefined
                                                    : t(
                                                          'reception.detail.noResend',
                                                      )
                                            }
                                            onClick={() =>
                                                latestConfirmation &&
                                                run('resend', async () => {
                                                    await source.notifications.resend(
                                                        latestConfirmation.id,
                                                    );
                                                    notify(
                                                        'success',
                                                        t(
                                                            'reception.detail.resentToast',
                                                        ),
                                                    );
                                                })
                                            }
                                        >
                                            {busy === 'resend' && (
                                                <Loader2
                                                    aria-hidden="true"
                                                    className="animate-spin motion-reduce:animate-none"
                                                />
                                            )}
                                            {t('reception.detail.resend')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                openReschedule(appointment)
                                            }
                                        >
                                            {t('reception.detail.reschedule')}
                                        </Button>
                                        <Button
                                            variant="outline-destructive"
                                            onClick={() => setConfirming(true)}
                                        >
                                            {t('reception.detail.cancel')}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-start gap-5">
                                <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
                                    <Card className="flex animate-rise flex-col gap-3.5 p-5 motion-reduce:animate-none">
                                        <CardTitle>
                                            {t('reception.detail.details')}
                                        </CardTitle>
                                        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-control">
                                            <Fact
                                                label={t(
                                                    'reception.detail.patient',
                                                )}
                                            >
                                                {row.patient.name}
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.phone',
                                                )}
                                            >
                                                {row.patient.phone ? (
                                                    <span
                                                        dir="ltr"
                                                        className="inline-block text-start"
                                                    >
                                                        {formatPhone(
                                                            row.patient.phone,
                                                            clinic.phoneCountryCode,
                                                        )}
                                                    </span>
                                                ) : (
                                                    t('reception.noPhone')
                                                )}
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.doctor',
                                                )}
                                            >
                                                {row.doctor.name}
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.service',
                                                )}
                                            >
                                                {row.service.name}{' '}
                                                <span dir="ltr">
                                                    ({row.service.durationMin}{' '}
                                                    min)
                                                </span>
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.when',
                                                )}
                                            >
                                                {formatLongDate(
                                                    localDate(
                                                        appointment.startsAt,
                                                        clinic.timezone,
                                                    ),
                                                    locale,
                                                )}
                                                {', '}
                                                <span dir="ltr">
                                                    {formatClock(
                                                        appointment.startsAt,
                                                        clinic.timezone,
                                                    )}
                                                </span>
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.channel',
                                                )}
                                            >
                                                {t(
                                                    `channel.${row.patient.preferredChannel}`,
                                                )}
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.language',
                                                )}
                                            >
                                                {t(
                                                    `reception.langName.${row.patient.preferredLocale}`,
                                                )}
                                            </Fact>
                                            <Fact
                                                label={t(
                                                    'reception.detail.bookedBy',
                                                )}
                                            >
                                                {t(
                                                    'reception.detail.bookedByValue',
                                                    {
                                                        name: userName(
                                                            appointment.createdBy,
                                                            data.users,
                                                        ),
                                                        source: t(
                                                            `reception.source.${appointment.source}`,
                                                        ),
                                                    },
                                                )}
                                            </Fact>
                                        </dl>
                                        <Link
                                            href={`/reception/patients/${row.patient.id}`}
                                            className="inline-flex min-h-11 w-fit items-center text-control font-semibold text-brand-hover hover:underline"
                                        >
                                            {t('reception.detail.openPatient')}
                                        </Link>
                                    </Card>

                                    <Card className="flex animate-rise flex-col gap-3.5 p-5 [animation-delay:60ms] motion-reduce:animate-none">
                                        <CardTitle>
                                            {t('reception.detail.history')}
                                        </CardTitle>
                                        {data.audit.length === 0 ? (
                                            <p className="text-control">
                                                {t(
                                                    'reception.detail.noHistory',
                                                )}
                                            </p>
                                        ) : (
                                            <ol className="flex flex-col gap-3.5">
                                                {history(
                                                    data.audit,
                                                    data.users,
                                                ).map((item) => (
                                                    <li
                                                        key={item.id}
                                                        className="flex items-start gap-3"
                                                    >
                                                        <span
                                                            aria-hidden="true"
                                                            className="mt-[9px] size-2.5 shrink-0 rounded-full bg-line-dashed"
                                                        />
                                                        <div className="flex flex-col leading-[1.5]">
                                                            <span className="text-control font-semibold text-ink">
                                                                {item.what}
                                                            </span>
                                                            <span className="text-label">
                                                                {item.who} ·{' '}
                                                                <span dir="ltr">
                                                                    {item.when}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </Card>
                                </div>

                                <Card className="flex min-w-0 flex-[1_1_360px] animate-rise flex-col gap-3.5 p-5 [animation-delay:120ms] motion-reduce:animate-none">
                                    <CardTitle>
                                        {t('reception.detail.reminders')}
                                    </CardTitle>
                                    {data.timeline.length === 0 ? (
                                        <p className="text-control">
                                            {t('reception.detail.noMessages')}
                                        </p>
                                    ) : (
                                        <ol className="flex flex-col gap-3.5">
                                            {data.timeline.map((item) => (
                                                <TimelineRow
                                                    key={item.id}
                                                    item={item}
                                                    timeZone={clinic.timezone}
                                                />
                                            ))}
                                        </ol>
                                    )}
                                </Card>
                            </div>
                        </>
                    )}

                <SampleNote />
            </PageBody>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t('reception.detail.cancelTitle')}
                description={t('reception.detail.cancelText')}
                confirmLabel={t('reception.detail.cancelYes')}
                cancelLabel={t('reception.detail.keep')}
                onConfirm={async () => {
                    if (!appointment) {
                        return;
                    }

                    try {
                        await source.appointments.cancel(appointment.id);
                        notify('success', t('reception.detail.cancelledToast'));
                        query.reload();
                        refresh();
                    } catch {
                        notify('error', t('reception.detail.actionFailed'));
                    }
                }}
            />
        </>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="text-subtle">{label}</dt>
            <dd className="m-0 font-semibold text-ink">{children}</dd>
        </>
    );
}

function TimelineRow({
    item,
    timeZone,
}: {
    item: TimelineItem;
    timeZone: string;
}) {
    const { t, locale } = useT();
    let Icon: LucideIcon = MessageSquare;
    let tone = 'bg-status-confirmed text-status-confirmed-ink';
    let title: string;
    let body: string;

    if (item.type === 'reply') {
        Icon = CircleCheck;
        tone = 'bg-status-done text-status-done-ink';
        title = t(`reception.detail.timeline.reply.${item.reply.action}`);
        body = t(`reception.detail.timeline.replyBody.${item.reply.action}`);
    } else {
        const { entry } = item;
        title = t(`reception.detail.timeline.message.${entry.kind}`);
        body =
            entry.status === 'failed' && entry.failureReason
                ? t(`reception.failure.${entry.failureReason}`)
                : t('reception.detail.timeline.messageBody', {
                      channel: t(`channel.${entry.channel}`),
                      status: t(`reception.msgStatus.${entry.status}`),
                  });

        if (entry.status === 'failed') {
            Icon = TriangleAlert;
            tone = 'bg-status-cancelled text-status-cancelled-ink';
        } else if (entry.status === 'queued') {
            Icon = Clock;
            tone = 'bg-status-booked text-status-booked-ink';
        }
    }

    return (
        <li className="flex animate-fade items-start gap-3 motion-reduce:animate-none">
            <span
                aria-hidden="true"
                className={cn(
                    'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
                    tone,
                )}
            >
                <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col leading-[1.5]">
                <span className="text-control font-semibold text-ink">
                    {title}
                </span>
                <span className="text-label">{body}</span>
                <span dir="ltr" className="text-start text-small text-subtle">
                    {formatStamp(item.at, timeZone, locale)}
                </span>
            </div>
        </li>
    );
}
