import { Head, Link, usePage } from '@inertiajs/react';
import {
    Activity,
    ArrowRight,
    CalendarClock,
    Check,
    CircleX,
    Clock,
    LogIn,
    WifiOff,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExpiredPanel } from '@/components/patient/expired-panel';
import { Notice } from '@/components/patient/notice';
import { PatientButton } from '@/components/patient/patient-button';
import {
    PatientHeading,
    PatientShell,
} from '@/components/patient/patient-shell';
import { formatClock } from '@/components/vocamed/booking/format';
import { ErrorState } from '@/components/vocamed/states';
import { usePatientView } from '@/hooks/use-patient-view';
import { useT } from '@/i18n/scope';
import type { QueueStage } from '@/lib/data';

const STAGE: Record<
    QueueStage,
    { icon: LucideIcon; colour: string; tint: string }
> = {
    waiting: { icon: Clock, colour: '#b8860b', tint: '#fff1cc' },
    next: { icon: ArrowRight, colour: '#1366d6', tint: '#eaf2fe' },
    consult: { icon: Activity, colour: '#6b3fc9', tint: '#eadffb' },
    done: { icon: Check, colour: '#2f9e5a', tint: '#dff3e4' },
    notYet: { icon: LogIn, colour: '#5b6781', tint: '#e8ecf4' },
    notToday: { icon: CalendarClock, colour: '#5b6781', tint: '#e8ecf4' },
    ended: { icon: CircleX, colour: '#5b6781', tint: '#e8ecf4' },
};

const REFRESH_MS = 10_000;

/** E3: where the patient is in the doctor's queue today. It refreshes by itself. */
export default function Status() {
    const { t } = useT();
    const { token } = usePage<{ token: string }>().props;
    const query = usePatientView('status', token, { refreshMs: REFRESH_MS });
    const view = query.data;
    const [seconds, setSeconds] = useState(0);

    // "Updated N seconds ago" counts up between refreshes and starts over when new data arrives.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeconds(0);
        const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);

        return () => window.clearInterval(timer);
    }, [view]);

    if (view?.state === 'expired') {
        return <ExpiredPanel view={view} token={token} />;
    }

    const valid = view?.state === 'valid' ? view : null;
    const spec = valid ? STAGE[valid.stage] : null;
    const Icon = spec?.icon;
    const counts =
        valid && (valid.stage === 'waiting' || valid.stage === 'next');

    return (
        <>
            <Head title={t('patient.status.title')}>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <PatientShell clinicName={valid?.clinic.name}>
                <PatientHeading
                    title={t('patient.status.title')}
                    lead={t('patient.status.sub')}
                />

                {query.status === 'loading' && (
                    <div
                        role="status"
                        aria-busy="true"
                        aria-label={t('patient.loading')}
                        className="flex flex-col gap-3"
                    >
                        {[180, 96, 72].map((height, index) => (
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
                    <div className="rounded-2xl border border-line bg-white">
                        <ErrorState onRetry={query.reload} />
                    </div>
                )}

                {valid && spec && Icon && (
                    <>
                        {query.stale && (
                            <Notice
                                tone="warning"
                                icon={WifiOff}
                                title={t('patient.status.paused')}
                            />
                        )}

                        <section
                            role="status"
                            aria-live="polite"
                            style={{ borderColor: spec.colour }}
                            className="flex flex-col items-center gap-2.5 rounded-2xl border-2 bg-white px-5 py-[22px] text-center"
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    background: spec.tint,
                                    color: spec.colour,
                                }}
                                className="inline-flex size-16 items-center justify-center rounded-full"
                            >
                                <Icon
                                    className="size-8 rtl:-scale-x-100"
                                    strokeWidth={2.4}
                                />
                            </span>
                            <strong
                                key={valid.stage}
                                className="animate-fade text-[22px] leading-[1.3] text-ink motion-reduce:animate-none"
                            >
                                {t(`patient.status.${valid.stage}.title`)}
                            </strong>
                            <span className="text-control">
                                {t(`patient.status.${valid.stage}.text`)}
                            </span>
                        </section>

                        {counts && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-[12px] border border-line bg-white p-4">
                                        <span className="block text-[34px] leading-[1.2] font-bold text-ink">
                                            {valid.ahead}
                                        </span>
                                        <span className="text-label font-semibold">
                                            {t('patient.status.ahead')}
                                        </span>
                                    </div>
                                    <div className="rounded-[12px] border border-line bg-white p-4">
                                        <span className="block text-[34px] leading-[1.2] font-bold text-ink">
                                            <span dir="ltr">
                                                {valid.waitMin === 0
                                                    ? t(
                                                          'patient.status.waitNow',
                                                      )
                                                    : t('patient.status.min', {
                                                          count: valid.waitMin,
                                                      })}
                                            </span>
                                        </span>
                                        <span className="text-label font-semibold">
                                            {t('patient.status.wait')}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-center text-[13.5px]">
                                    {t('patient.status.estimate')}
                                </p>
                            </>
                        )}

                        <div className="flex flex-col gap-1.5 rounded-[12px] border border-line bg-white p-4">
                            <span className="text-small text-subtle">
                                {t('patient.status.yourVisit')}
                            </span>
                            <strong className="text-body text-ink">
                                {t('patient.status.visit', {
                                    doctor: valid.appointment.doctorName,
                                    time: formatClock(
                                        valid.appointment.startsAt,
                                        valid.clinic.timezone,
                                    ),
                                })}
                            </strong>
                        </div>

                        <div className="flex items-center justify-center gap-2.5 text-[13.5px]">
                            <span
                                aria-hidden="true"
                                className="size-2.5 animate-soft-pulse rounded-full bg-[#2f9e5a] motion-reduce:animate-none"
                            />
                            <span>
                                {seconds < 2
                                    ? t('patient.status.updatedNow')
                                    : t('patient.status.updated', {
                                          count: seconds,
                                      })}
                            </span>
                        </div>

                        <PatientButton tone="outline" asChild>
                            <Link href={`/p/${token}`}>
                                {t('patient.status.back')}
                            </Link>
                        </PatientButton>
                    </>
                )}
            </PatientShell>
        </>
    );
}
