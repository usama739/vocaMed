import { Head, Link, usePage } from '@inertiajs/react';
import {
    CalendarDays,
    CircleCheck,
    CircleX,
    Clock,
    Loader2,
    MapPin,
    Phone,
    TriangleAlert,
    UserCheck,
} from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { CancelSheet } from '@/components/patient/confirm-sheet';
import { ExpiredPanel } from '@/components/patient/expired-panel';
import {
    mapsHref,
    nationalPhone,
    visitWeekday,
    visitWhen,
} from '@/components/patient/format';
import { Notice } from '@/components/patient/notice';
import { PatientButton } from '@/components/patient/patient-button';
import {
    PatientHeading,
    PatientShell,
} from '@/components/patient/patient-shell';
import { initialsOf } from '@/components/reception/format';
import { formatClock } from '@/components/vocamed/booking/format';
import { ErrorState } from '@/components/vocamed/states';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { usePatientError } from '@/hooks/use-patient-error';
import { usePatientLinks } from '@/hooks/use-patient-links';
import { usePatientView } from '@/hooks/use-patient-view';
import { useT } from '@/i18n/scope';
import type { ManageView } from '@/lib/data';

const ROW_LABEL = 'text-small text-subtle';

/** E1: the patient's appointment, with Confirm, Reschedule and Cancel. */
export default function Manage() {
    const { t, locale } = useT();
    const { token } = usePage<{ token: string }>().props;
    const source = usePatientLinks();
    const describe = usePatientError();
    const query = usePatientView('manage', token);
    const [pending, setPending] = useState<'confirm' | 'cancel' | null>(null);
    const [thanks, setThanks] = useState(false);
    const [error, setError] = useState('');
    const [sheet, setSheet] = useState(false);
    const cancelButton = useRef<HTMLButtonElement>(null);

    const view = query.data;

    if (view?.state === 'expired') {
        return <ExpiredPanel view={view} token={token} />;
    }

    const act = async (kind: 'confirm' | 'cancel') => {
        setPending(kind);
        setError('');

        try {
            if (kind === 'confirm') {
                await source.confirm(token);
                setThanks(true);
            } else {
                await source.cancel(token);
                setThanks(false);
            }
        } catch (caught) {
            setError(describe(caught));
        } finally {
            setSheet(false);
            setPending(null);
            // The page always shows what the server now says, whether the action worked or not.
            query.reload();
        }
    };

    return (
        <>
            <Head title={t('patient.manage.title')}>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <PatientShell clinicName={view?.clinic.name}>
                {query.status === 'loading' && (
                    <div
                        role="status"
                        aria-busy="true"
                        aria-label={t('patient.loading')}
                        className="flex flex-col gap-3"
                    >
                        {[64, 260, 56, 56, 56].map((height, index) => (
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
                {query.status === 'ready' && view?.state === 'valid' && (
                    <Details
                        view={view}
                        token={token}
                        thanks={thanks}
                        error={error}
                        pending={pending}
                        onConfirm={() => act('confirm')}
                        onAskCancel={() => setSheet(true)}
                        cancelButton={cancelButton}
                        locale={locale}
                    />
                )}
            </PatientShell>
            <CancelSheet
                open={sheet}
                onOpenChange={setSheet}
                pending={pending === 'cancel'}
                returnFocusTo={cancelButton}
                onConfirm={() => act('cancel')}
            />
        </>
    );
}

function Details({
    view,
    token,
    thanks,
    error,
    pending,
    onConfirm,
    onAskCancel,
    cancelButton,
    locale,
}: {
    view: ManageView;
    token: string;
    thanks: boolean;
    error: string;
    pending: 'confirm' | 'cancel' | null;
    onConfirm: () => void;
    onAskCancel: () => void;
    cancelButton: RefObject<HTMLButtonElement | null>;
    locale: 'en' | 'ur';
}) {
    const { t } = useT();
    const { appointment, clinic, allowed } = view;
    const status = appointment.status;
    const open = status === 'booked' || status === 'confirmed';
    const tz = clinic.timezone;
    const phone = nationalPhone(clinic.phone);
    const phoneEl = (
        <span dir="ltr" className="inline-block">
            {phone}
        </span>
    );
    const callLink = (
        <PatientButton tone="outline" asChild>
            <a href={`tel:${clinic.phone}`}>
                <Phone aria-hidden="true" className="size-5" />
                <span>
                    {t('patient.call')} {phoneEl}
                </span>
            </a>
        </PatientButton>
    );

    return (
        <>
            <PatientHeading
                title={t('patient.manage.hello', {
                    name: appointment.firstName,
                })}
                lead={open ? t('patient.manage.intro') : undefined}
            />

            {thanks && status === 'confirmed' && (
                <Notice
                    tone="success"
                    icon={CircleCheck}
                    title={t('patient.manage.okTitle')}
                >
                    {t('patient.manage.okText', {
                        day: visitWeekday(appointment.startsAt, tz, locale),
                        time: formatClock(appointment.startsAt, tz),
                    })}
                </Notice>
            )}
            {status === 'cancelled' && (
                <Notice
                    tone="danger"
                    icon={CircleX}
                    title={t('patient.manage.cancelledTitle')}
                >
                    {t('patient.manage.cancelledText', { phone })}
                </Notice>
            )}
            {status === 'arrived' && (
                <Notice
                    tone="info"
                    icon={UserCheck}
                    title={t('patient.manage.arrivedTitle')}
                >
                    {t('patient.manage.arrivedText')}
                </Notice>
            )}
            {status === 'in_consultation' && (
                <Notice
                    tone="info"
                    icon={Clock}
                    title={t('patient.manage.consultTitle')}
                >
                    {t('patient.manage.consultText')}
                </Notice>
            )}
            {status === 'done' && (
                <Notice
                    tone="success"
                    icon={CircleCheck}
                    title={t('patient.manage.doneTitle')}
                >
                    {t('patient.manage.doneText')}
                </Notice>
            )}
            {status === 'no_show' && (
                <Notice
                    tone="warning"
                    icon={TriangleAlert}
                    title={t('patient.manage.noShowTitle')}
                >
                    {t('patient.manage.noShowText', { phone })}
                </Notice>
            )}
            {error && (
                <Notice
                    tone="danger"
                    role="alert"
                    icon={TriangleAlert}
                    title={error}
                />
            )}

            <section
                aria-label={t('patient.manage.details')}
                className="flex animate-rise flex-col gap-3.5 rounded-2xl border border-line bg-white p-5 motion-reduce:animate-none"
            >
                <div className="flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-deep"
                    >
                        {initialsOf(appointment.doctorName)}
                    </span>
                    <div className="flex min-w-0 flex-col leading-[1.4]">
                        <strong className="text-[17px] text-ink">
                            {appointment.doctorName}
                        </strong>
                        <span className="text-[14.5px]">
                            {appointment.serviceName} ·{' '}
                            {t('patient.status.min', {
                                count: appointment.durationMin,
                            })}
                        </span>
                    </div>
                </div>
                <dl className="m-0 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <CalendarDays
                            aria-hidden="true"
                            className="mt-1 size-5 shrink-0 text-brand"
                        />
                        <div>
                            <dt className={ROW_LABEL}>
                                {t('patient.manage.when')}
                            </dt>
                            <dd className="m-0 text-[17px] font-bold text-ink">
                                {visitWhen(appointment.startsAt, tz, locale)}
                            </dd>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <MapPin
                            aria-hidden="true"
                            className="mt-1 size-5 shrink-0 text-brand"
                        />
                        <div>
                            <dt className={ROW_LABEL}>
                                {t('patient.manage.where')}
                            </dt>
                            <dd className="m-0 text-control font-semibold text-ink">
                                {clinic.address}
                            </dd>
                            <a
                                href={mapsHref(clinic.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center text-control font-semibold text-brand-hover"
                            >
                                {t('patient.manage.map')}
                            </a>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Clock
                            aria-hidden="true"
                            className="size-5 shrink-0 text-brand"
                        />
                        <div>
                            <dt className={ROW_LABEL}>
                                {t('patient.manage.status')}
                            </dt>
                            <dd className="m-0">
                                <StatusBadge status={status} />
                            </dd>
                        </div>
                    </div>
                </dl>
            </section>

            {open && (
                <div className="flex flex-col gap-2.5">
                    <PatientButton
                        tone={status === 'confirmed' ? 'success' : 'primary'}
                        disabled={!allowed.confirm || pending !== null}
                        onClick={onConfirm}
                    >
                        {pending === 'confirm' && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {pending === 'confirm'
                            ? t('patient.manage.confirming')
                            : status === 'confirmed'
                              ? `✓ ${t('patient.manage.confirmed')}`
                              : t('patient.manage.confirm')}
                    </PatientButton>

                    {view.late && (
                        <>
                            <Notice
                                tone="warning"
                                role="note"
                                icon={TriangleAlert}
                                title={t('patient.manage.lateTitle')}
                            >
                                {t('patient.manage.lateText')}
                            </Notice>
                            {callLink}
                        </>
                    )}
                    {view.pendingRequest && (
                        <Notice
                            tone="info"
                            role="note"
                            icon={Clock}
                            title={t('patient.manage.pendingTitle')}
                        >
                            {t('patient.manage.pendingText')}
                        </Notice>
                    )}

                    {allowed.reschedule && (
                        <PatientButton tone="outline" asChild>
                            <Link href={`/p/${token}/reschedule`}>
                                {t('patient.manage.reschedule')}
                            </Link>
                        </PatientButton>
                    )}
                    {allowed.cancel && (
                        <PatientButton
                            ref={cancelButton}
                            tone="danger"
                            disabled={pending !== null}
                            onClick={onAskCancel}
                        >
                            {t('patient.manage.cancel')}
                        </PatientButton>
                    )}
                    {allowed.cancel &&
                        view.cancellationWindowHours !== null && (
                            <p className="mt-1 text-center text-[13.5px]">
                                {t('patient.manage.policy', {
                                    count: view.cancellationWindowHours,
                                })}
                            </p>
                        )}
                </div>
            )}

            {view.queueOpen &&
                status !== 'cancelled' &&
                status !== 'no_show' && (
                    <PatientButton tone="outline" asChild>
                        <Link href={`/p/${token}/status`}>
                            {t('patient.manage.queue')}
                        </Link>
                    </PatientButton>
                )}
        </>
    );
}
