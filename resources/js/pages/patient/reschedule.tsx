import { Head, Link, usePage } from '@inertiajs/react';
import { Check, Clock, Loader2, Phone, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExpiredPanel } from '@/components/patient/expired-panel';
import { nationalPhone, visitWhen } from '@/components/patient/format';
import { Notice } from '@/components/patient/notice';
import { PatientButton } from '@/components/patient/patient-button';
import {
    PatientHeading,
    PatientShell,
} from '@/components/patient/patient-shell';
import { formatClock } from '@/components/vocamed/booking/format';
import { ErrorState } from '@/components/vocamed/states';
import { usePatientError } from '@/hooks/use-patient-error';
import { usePatientLinks } from '@/hooks/use-patient-links';
import { usePatientView } from '@/hooks/use-patient-view';
import { useT } from '@/i18n/scope';
import type { IsoDate, IsoDateTime, RescheduleOutcome } from '@/lib/data';
import { cn } from '@/lib/utils';

const intl = (locale: 'en' | 'ur') =>
    locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB';

const parts = (date: IsoDate, locale: 'en' | 'ur') => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, d, 12));
    const format = (options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(intl(locale), {
            timeZone: 'UTC',
            ...options,
        }).format(at);

    return {
        weekday: format({ weekday: 'short' }),
        number: String(d),
        full: format({ weekday: 'long', day: 'numeric', month: 'long' }),
    };
};

/** E2: choose a new day and time, over the next fourteen days. */
export default function Reschedule() {
    const { t, locale } = useT();
    const { token } = usePage<{ token: string }>().props;
    const source = usePatientLinks();
    const describe = usePatientError();
    const query = usePatientView('reschedule', token);
    const [date, setDate] = useState<IsoDate | null>(null);
    const [slot, setSlot] = useState<IsoDateTime | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [outcome, setOutcome] = useState<RescheduleOutcome | null>(null);

    const view = query.data;
    const days = useMemo(
        () => (view?.state === 'valid' ? view.days : []),
        [view],
    );

    // Until the patient picks a day, show the first one that has a free time.
    const activeDate =
        date ??
        days.find((d) => d.slots.length > 0)?.date ??
        days[0]?.date ??
        null;

    if (view?.state === 'expired') {
        return <ExpiredPanel view={view} token={token} />;
    }

    const valid = view?.state === 'valid' ? view : null;
    const tz = valid?.clinic.timezone ?? 'UTC';
    const chosen = days.find((d) => d.date === activeDate);
    const needsApproval = valid?.needsApproval ?? false;

    const submit = async () => {
        if (!slot) {
            return;
        }

        setSending(true);
        setError('');

        try {
            setOutcome(await source.reschedule(token, slot));
        } catch (caught) {
            setError(describe(caught));
            setSlot(null);
            // The times are asked for again, so the one that was taken disappears.
            query.reload();
        } finally {
            setSending(false);
        }
    };

    const cannot = valid && !valid.allowed.reschedule && !outcome;
    const noneAtAll =
        valid &&
        valid.allowed.reschedule &&
        days.every((d) => d.slots.length === 0);
    const phone = valid ? nationalPhone(valid.clinic.phone) : '';

    return (
        <>
            <Head title={t('patient.reschedule.title')}>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <PatientShell
                back={{
                    href: `/p/${token}`,
                    label: t('patient.reschedule.back'),
                }}
            >
                {query.status === 'loading' && (
                    <div
                        role="status"
                        aria-busy="true"
                        aria-label={t('patient.loading')}
                        className="flex flex-col gap-3"
                    >
                        {[64, 56, 100, 260, 56].map((height, index) => (
                            <div
                                key={index}
                                aria-hidden="true"
                                style={{ height }}
                                className="animate-pulse rounded-2xl bg-status-booked/60 motion-reduce:animate-none"
                            />
                        ))}
                    </div>
                )}
                {query.status === 'error' && (
                    <div className="rounded-2xl border border-line bg-white shadow-soft">
                        <ErrorState onRetry={query.reload} />
                    </div>
                )}

                {valid && outcome && (
                    <div
                        role="status"
                        className="flex flex-col items-center gap-3 py-9 text-center"
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                'inline-flex size-16 items-center justify-center rounded-full',
                                outcome.result === 'requested'
                                    ? 'bg-brand-wash text-brand-deep'
                                    : 'bg-[#dff3e4] text-[#14532d]',
                            )}
                        >
                            {outcome.result === 'requested' ? (
                                <Clock className="size-8" strokeWidth={2.6} />
                            ) : (
                                <Check className="size-8" strokeWidth={2.6} />
                            )}
                        </span>
                        <h1 className="text-[22px] leading-[1.2] font-bold text-ink">
                            {t(
                                outcome.result === 'requested'
                                    ? 'patient.reschedule.requestedTitle'
                                    : 'patient.reschedule.movedTitle',
                            )}
                        </h1>
                        <p className="text-control">
                            {t(
                                outcome.result === 'requested'
                                    ? 'patient.reschedule.requestedText'
                                    : 'patient.reschedule.movedText',
                            )}
                        </p>
                        <dl className="m-0 rounded-[12px] border border-line bg-white px-4 py-3.5 text-control font-semibold text-ink">
                            <dt className="text-small font-normal text-subtle">
                                {t('patient.reschedule.newTime')}
                            </dt>
                            <dd className="m-0">
                                {visitWhen(outcome.startsAt, tz, locale)}
                            </dd>
                        </dl>
                        <PatientButton tone="outline" asChild>
                            <Link href={`/p/${token}`}>
                                {t('patient.reschedule.backToAppointment')}
                            </Link>
                        </PatientButton>
                    </div>
                )}

                {valid && cannot && (
                    <>
                        <PatientHeading title={t('patient.reschedule.title')} />
                        <Notice
                            tone="warning"
                            role="note"
                            icon={TriangleAlert}
                            title={t('patient.reschedule.cannotTitle')}
                        >
                            {valid.pendingRequest
                                ? t('patient.reschedule.cannotPending')
                                : valid.late
                                  ? t('patient.reschedule.cannotLate')
                                  : t('patient.reschedule.cannotOther')}
                        </Notice>
                        <PatientButton tone="outline" asChild>
                            <Link href={`/p/${token}`}>
                                {t('patient.reschedule.backToAppointment')}
                            </Link>
                        </PatientButton>
                    </>
                )}

                {valid && !outcome && !cannot && (
                    <>
                        <PatientHeading
                            title={t('patient.reschedule.title')}
                            lead={t('patient.reschedule.sub', {
                                doctor: valid.appointment.doctorName,
                            })}
                        />
                        <div className="rounded-[12px] border border-line bg-white px-4 py-3 text-[14.5px]">
                            <span className="text-subtle">
                                {t('patient.reschedule.current')}
                            </span>{' '}
                            <strong className="text-ink">
                                {visitWhen(
                                    valid.appointment.startsAt,
                                    tz,
                                    locale,
                                )}
                            </strong>
                        </div>
                        {needsApproval && (
                            <Notice
                                tone="info"
                                role="note"
                                icon={Clock}
                                title={t('patient.reschedule.approval')}
                            />
                        )}
                        {error && (
                            <Notice
                                tone="danger"
                                role="alert"
                                icon={TriangleAlert}
                                title={error}
                            />
                        )}

                        {noneAtAll ? (
                            <>
                                <Notice
                                    tone="warning"
                                    role="note"
                                    icon={TriangleAlert}
                                    title={t('patient.reschedule.noneAll')}
                                />
                                <PatientButton tone="outline" asChild>
                                    <a href={`tel:${valid.clinic.phone}`}>
                                        <Phone
                                            aria-hidden="true"
                                            className="size-5"
                                        />
                                        <span>
                                            {t('patient.call')}{' '}
                                            <span dir="ltr">{phone}</span>
                                        </span>
                                    </a>
                                </PatientButton>
                            </>
                        ) : (
                            <>
                                <section
                                    aria-labelledby="pick-day"
                                    className="flex flex-col gap-2.5"
                                >
                                    <h2
                                        id="pick-day"
                                        className="text-body font-semibold text-ink"
                                    >
                                        {t('patient.reschedule.day')}
                                    </h2>
                                    <div
                                        role="group"
                                        aria-labelledby="pick-day"
                                        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5"
                                    >
                                        {days.map((day) => {
                                            const label = parts(
                                                day.date,
                                                locale,
                                            );
                                            const on = activeDate === day.date;

                                            return (
                                                <button
                                                    key={day.date}
                                                    type="button"
                                                    aria-pressed={on}
                                                    disabled={day.closed}
                                                    aria-label={
                                                        day.closed
                                                            ? `${label.full}, ${t('patient.reschedule.closed')}`
                                                            : label.full
                                                    }
                                                    onClick={() => {
                                                        setDate(day.date);
                                                        setSlot(null);
                                                        setError('');
                                                    }}
                                                    className={cn(
                                                        'flex min-h-[68px] min-w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] border px-1 transition-[transform,background-color,border-color] duration-150',
                                                        day.closed
                                                            ? 'cursor-not-allowed border-line-strong bg-surface-held text-[#9aa6bf]'
                                                            : on
                                                              ? 'border-2 border-brand bg-brand-tint text-brand-deep'
                                                              : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                                                    )}
                                                >
                                                    <span className="text-[12.5px]">
                                                        {label.weekday}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'text-[18px] font-bold',
                                                            day.closed &&
                                                                'line-through',
                                                        )}
                                                    >
                                                        {label.number}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section
                                    aria-labelledby="pick-time"
                                    className="flex flex-col gap-2.5"
                                >
                                    <h2
                                        id="pick-time"
                                        className="text-body font-semibold text-ink"
                                    >
                                        {t('patient.reschedule.time')}
                                    </h2>
                                    {chosen && chosen.slots.length === 0 && (
                                        <p className="rounded-[12px] border border-dashed border-line-strong p-4 text-center">
                                            {t('patient.reschedule.noneDay')}
                                        </p>
                                    )}
                                    <div
                                        role="group"
                                        aria-labelledby="pick-time"
                                        className="grid grid-cols-3 gap-2.5"
                                    >
                                        {chosen?.slots.map((iso) => {
                                            const on = slot === iso;

                                            return (
                                                <button
                                                    key={iso}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() => {
                                                        setSlot(iso);
                                                        setError('');
                                                    }}
                                                    className={cn(
                                                        'inline-flex min-h-14 items-center justify-center gap-1.5 rounded-[12px] border text-body font-bold transition-colors',
                                                        on
                                                            ? 'border-2 border-brand bg-brand-tint text-brand-deep'
                                                            : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                                                    )}
                                                >
                                                    {on && (
                                                        <Check
                                                            aria-hidden="true"
                                                            className="size-4"
                                                            strokeWidth={3}
                                                        />
                                                    )}
                                                    <span dir="ltr">
                                                        {formatClock(iso, tz)}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <PatientButton
                                    disabled={!slot || sending}
                                    onClick={submit}
                                >
                                    {sending && (
                                        <Loader2
                                            aria-hidden="true"
                                            className="animate-spin motion-reduce:animate-none"
                                        />
                                    )}
                                    {sending
                                        ? t('patient.reschedule.sending')
                                        : slot
                                          ? t(
                                                needsApproval
                                                    ? 'patient.reschedule.request'
                                                    : 'patient.reschedule.confirm',
                                            )
                                          : t('patient.reschedule.choose')}
                                </PatientButton>
                            </>
                        )}
                    </>
                )}
            </PatientShell>
        </>
    );
}
