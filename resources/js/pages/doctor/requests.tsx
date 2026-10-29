import { Head } from '@inertiajs/react';
import { ArrowRight, Check, Clock, Inbox, Loader2, X } from 'lucide-react';
import { useId, useState } from 'react';
import {
    formatShortDate,
    formatWeekdayShort,
    localDate,
} from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { useReception } from '@/components/reception/runtime';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { EmptyState } from '@/components/vocamed/states';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import { DataError, type RequestRow, type Slot } from '@/lib/data';
import { cn } from '@/lib/utils';

export default function Requests() {
    const { t, locale } = useT();
    const source = useData();
    const { refresh } = useReception();
    const query = useView('requests', undefined, {
        emptyFrom: (d) => ({ ...d, pending: [] }),
    });
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<{ id: string; decision: string } | null>(
        null,
    );
    const [conflicts, setConflicts] = useState<Record<string, Slot[]>>({});

    const data = query.data;
    const tz = data?.clinic.timezone ?? 'UTC';

    /** "Sat 24 Oct, 11:00", with the time kept left to right. */
    const when = (iso: string) => {
        const date = localDate(iso, tz);

        return `${formatWeekdayShort(date, locale)} ${formatShortDate(date, locale)}, ${formatClock(iso, tz)}`;
    };

    const decide = async (
        row: RequestRow,
        decision: 'approved' | 'rejected',
    ) => {
        setBusy({ id: row.request.id, decision });

        try {
            await source.requests.decide(row.request.id, {
                decision,
                message: notes[row.request.id],
            });
            setConflicts(({ [row.request.id]: _gone, ...rest }) => {
                void _gone;

                return rest;
            });
            notify(
                'success',
                t(
                    decision === 'approved'
                        ? 'doctor.requests.okApproved'
                        : 'doctor.requests.okRejected',
                ),
            );
            query.reload();
            // The sidebar badge counts what is still waiting.
            refresh();
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'SLOT_UNAVAILABLE'
            ) {
                setConflicts((c) => ({
                    ...c,
                    [row.request.id]: caught.alternatives,
                }));
            } else {
                notify('error', t('doctor.requests.failed'));
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <Head title={t('doctor.requests.title')} />
            <PageBody>
                <PageHeader
                    title={t('doctor.requests.title')}
                    lead={t('doctor.requests.sub')}
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('doctor.loading')}
                        blocks={[220, 220, 200]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && (
                    <>
                        <section
                            aria-labelledby="waiting-for-you"
                            className="flex flex-col gap-3.5"
                        >
                            <h2
                                id="waiting-for-you"
                                className="text-lead font-semibold text-ink"
                            >
                                {t('doctor.requests.pendingTitle', {
                                    count: data.pending.length,
                                })}
                            </h2>
                            {data.pending.map((row, index) => (
                                <RequestCard
                                    key={row.request.id}
                                    row={row}
                                    index={index}
                                    from={when(row.request.fromStartsAt)}
                                    to={when(row.request.proposedStartsAt)}
                                    note={notes[row.request.id] ?? ''}
                                    onNote={(value) =>
                                        setNotes((n) => ({
                                            ...n,
                                            [row.request.id]: value,
                                        }))
                                    }
                                    busy={
                                        busy?.id === row.request.id
                                            ? busy.decision
                                            : null
                                    }
                                    disabled={busy !== null}
                                    alternatives={conflicts[row.request.id]}
                                    timeZone={tz}
                                    onDecide={(decision) =>
                                        decide(row, decision)
                                    }
                                />
                            ))}
                            {data.pending.length === 0 && (
                                <div className="rounded-xl border border-dashed border-line-strong">
                                    <EmptyState
                                        icon={Inbox}
                                        title={t('doctor.requests.emptyTitle')}
                                        description={t(
                                            'doctor.requests.emptyBody',
                                        )}
                                    />
                                </div>
                            )}
                        </section>

                        <section
                            aria-labelledby="request-history"
                            className="animate-rise overflow-hidden rounded-xl border border-line bg-white shadow-soft motion-reduce:animate-none"
                        >
                            <h2
                                id="request-history"
                                className="border-b border-line bg-surface-subtle px-5 py-4 text-lead font-semibold text-ink"
                            >
                                {t('doctor.requests.history')}
                            </h2>
                            {data.history.length === 0 ? (
                                <p className="px-5 py-6 text-control">
                                    {t('doctor.requests.noHistory')}
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[680px] border-collapse text-[14.5px]">
                                        <caption className="sr-only">
                                            {t('doctor.requests.history')}
                                        </caption>
                                        <thead className="sr-only">
                                            <tr>
                                                <th scope="col">
                                                    {t(
                                                        'doctor.requests.colPatient',
                                                    )}
                                                </th>
                                                <th scope="col">
                                                    {t(
                                                        'doctor.requests.colChange',
                                                    )}
                                                </th>
                                                <th scope="col">
                                                    {t(
                                                        'doctor.requests.colResult',
                                                    )}
                                                </th>
                                                <th scope="col">
                                                    {t(
                                                        'doctor.requests.colNote',
                                                    )}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.history.map((row) => {
                                                const ok =
                                                    row.request.status ===
                                                    'approved';

                                                return (
                                                    <tr
                                                        key={row.request.id}
                                                        className="border-b border-line-soft last:border-b-0"
                                                    >
                                                        <td className="px-5 py-3 font-semibold text-ink">
                                                            {
                                                                row.row.patient
                                                                    .name
                                                            }
                                                        </td>
                                                        <td
                                                            dir="ltr"
                                                            className="px-3 py-3 text-start"
                                                        >
                                                            {when(
                                                                row.request
                                                                    .fromStartsAt,
                                                            )}{' '}
                                                            →{' '}
                                                            {when(
                                                                row.request
                                                                    .proposedStartsAt,
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span
                                                                className={cn(
                                                                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold',
                                                                    ok
                                                                        ? 'bg-status-done text-status-done-ink'
                                                                        : 'bg-danger-surface text-danger-deep',
                                                                )}
                                                            >
                                                                {ok ? (
                                                                    <Check
                                                                        aria-hidden="true"
                                                                        className="size-3.5"
                                                                        strokeWidth={
                                                                            2.6
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <X
                                                                        aria-hidden="true"
                                                                        className="size-3.5"
                                                                        strokeWidth={
                                                                            2.6
                                                                        }
                                                                    />
                                                                )}
                                                                {t(
                                                                    ok
                                                                        ? 'doctor.requests.approved'
                                                                        : 'doctor.requests.rejected',
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 pe-5 text-label">
                                                            {
                                                                row.request
                                                                    .message
                                                            }
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}

                <p className="text-label text-subtle">
                    {t('doctor.requests.p2')} · {t('common.sample')}
                </p>
                <SampleNote className="sr-only" />
            </PageBody>
        </>
    );
}

function RequestCard({
    row,
    index,
    from,
    to,
    note,
    onNote,
    busy,
    disabled,
    alternatives,
    timeZone,
    onDecide,
}: {
    row: RequestRow;
    index: number;
    from: string;
    to: string;
    note: string;
    onNote: (value: string) => void;
    busy: string | null;
    disabled: boolean;
    alternatives?: Slot[];
    timeZone: string;
    onDecide: (decision: 'approved' | 'rejected') => void;
}) {
    const { t } = useT();
    const noteId = useId();
    const headingId = useId();

    return (
        <article
            aria-labelledby={headingId}
            data-request={row.request.id}
            style={{ animationDelay: `${index * 60}ms` }}
            className="flex animate-rise flex-col gap-3.5 rounded-xl border border-line bg-white p-5 shadow-soft motion-reduce:animate-none"
        >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-col leading-[1.4]">
                    <strong id={headingId} className="text-[17px] text-ink">
                        {row.row.patient.name}
                    </strong>
                    <span className="text-label">
                        {row.row.service.name} · {t('doctor.requests.asked')}
                    </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff1cc] px-3 py-[5px] text-small font-semibold text-[#6b4300]">
                    <Clock aria-hidden="true" className="size-3.5" />
                    {t('doctor.requests.pendingL')}
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-control text-ink">
                <span className="rounded-md border border-line bg-surface-subtle px-3.5 py-2">
                    <span className="block text-caption text-subtle">
                        {t('doctor.requests.current')}
                    </span>
                    <strong dir="ltr">{from}</strong>
                </span>
                <ArrowRight
                    aria-hidden="true"
                    className="size-5 text-subtle rtl:-scale-x-100"
                />
                <span className="rounded-md border border-brand-line bg-brand-tint px-3.5 py-2">
                    <span className="block text-caption text-brand-deep">
                        {t('doctor.requests.wanted')}
                    </span>
                    <strong dir="ltr">{to}</strong>
                </span>
            </div>

            {alternatives && (
                <div
                    role="alert"
                    className="flex flex-col gap-1.5 rounded-lg border border-warning-line bg-warning-surface px-4 py-3 text-control text-warning-ink"
                >
                    <strong>{t('doctor.requests.conflict')}</strong>
                    <span>{t('doctor.requests.conflictBody')}</span>
                    <span dir="ltr" className="font-bold">
                        {alternatives
                            .map((slot) => formatClock(slot.startsAt, timeZone))
                            .join('  ·  ')}
                    </span>
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                <label
                    htmlFor={noteId}
                    className="text-label font-semibold text-ink"
                >
                    {t('doctor.requests.msg')}
                </label>
                <textarea
                    id={noteId}
                    rows={2}
                    value={note}
                    placeholder={t('doctor.requests.msgPh')}
                    onChange={(event) => onNote(event.target.value)}
                    className="w-full resize-y rounded-md border border-line-strong bg-white px-3.5 py-3 text-body text-ink placeholder:text-subtle"
                />
            </div>

            <div className="flex flex-wrap gap-2.5">
                <Button
                    disabled={disabled || !!alternatives}
                    aria-label={t('doctor.requests.approveAria', {
                        patient: row.row.patient.name,
                    })}
                    onClick={() => onDecide('approved')}
                >
                    {busy === 'approved' && (
                        <Loader2
                            aria-hidden="true"
                            className="animate-spin motion-reduce:animate-none"
                        />
                    )}
                    {t('doctor.requests.approve')}
                </Button>
                <Button
                    variant="outline-destructive"
                    disabled={disabled}
                    aria-label={t('doctor.requests.rejectAria', {
                        patient: row.row.patient.name,
                    })}
                    onClick={() => onDecide('rejected')}
                >
                    {busy === 'rejected' && (
                        <Loader2
                            aria-hidden="true"
                            className="animate-spin motion-reduce:animate-none"
                        />
                    )}
                    {t('doctor.requests.reject')}
                </Button>
            </div>
        </article>
    );
}
