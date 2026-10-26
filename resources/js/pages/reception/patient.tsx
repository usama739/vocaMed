import { Head, Link } from '@inertiajs/react';
import { CalendarPlus, CalendarX2, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    formatPhone,
    formatShortDate,
    localDate,
    relativeDay,
    digitsOf,
} from '@/components/reception/format';
import {
    Card,
    CardTitle,
    NotFoundPanel,
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    PatientAvatar,
    SampleNote,
} from '@/components/reception/page-parts';
import { useReception } from '@/components/reception/runtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import {
    CheckboxField,
    FormField,
    TextareaField,
} from '@/components/vocamed/form-fields';
import { EmptyState } from '@/components/vocamed/states';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import {
    type AppointmentRow,
    type Channel,
    type Clinic,
    type Locale,
    type Patient,
} from '@/lib/data';

type Draft = {
    phone: string;
    preferredLocale: Locale;
    preferredChannel: Channel;
    consent: boolean;
    notes: string;
};

const draftOf = (patient: Patient, clinic: Clinic): Draft => ({
    phone: formatPhone(patient.phone, clinic.phoneCountryCode),
    preferredLocale: patient.preferredLocale,
    preferredChannel: patient.preferredChannel,
    consent: patient.consent,
    notes: patient.notes,
});

const OPEN_STATUSES = new Set([
    'booked',
    'confirmed',
    'arrived',
    'in_consultation',
]);

export default function PatientProfile({ id }: { id: string }) {
    const { t, locale } = useT();
    const { forField } = useErrorText();
    const source = useData();
    const { openBooking } = useReception();

    const query = useView('patient', id, { refreshMs: 0 });

    const data = query.data;
    const patient = data?.patient;
    const clinic = data?.clinic;
    const [draft, setDraft] = useState<Draft | null>(null);
    const [errors, setErrors] = useState<{ phone?: string; form?: string }>({});
    const [saving, setSaving] = useState(false);

    // The form starts from the saved record. A reload (after booking from here, say) only
    // replaces it when nothing was edited, so typing is never thrown away.
    const base = useRef<{ id: string; key: string } | null>(null);

    useEffect(() => {
        if (!patient || !clinic) {
            return;
        }

        const next = draftOf(patient, clinic);
        const previous = base.current;
        base.current = { id: patient.id, key: JSON.stringify(next) };
        setDraft((current) =>
            current === null ||
            previous?.id !== patient.id ||
            JSON.stringify(current) === previous.key
                ? next
                : current,
        );
    }, [patient, clinic]);

    const saved = useMemo(
        () => (patient && clinic ? draftOf(patient, clinic) : null),
        [patient, clinic],
    );
    const dirty =
        !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

    const today = data?.today ?? null;

    const { upcoming, past, counts } = useMemo(() => {
        const rows = [...(data?.appointments ?? [])].sort((a, b) =>
            a.appointment.startsAt.localeCompare(b.appointment.startsAt),
        );
        const isUpcoming = (r: AppointmentRow) =>
            OPEN_STATUSES.has(r.appointment.status) &&
            !!today &&
            !!clinic &&
            localDate(r.appointment.startsAt, clinic.timezone) >= today;
        const up = rows.filter(isUpcoming);

        return {
            upcoming: up,
            past: rows.filter((r) => !isUpcoming(r)).reverse(),
            counts: {
                visits: rows.filter((r) =>
                    ['done', 'in_consultation', 'arrived'].includes(
                        r.appointment.status,
                    ),
                ).length,
                cancelled: rows.filter(
                    (r) => r.appointment.status === 'cancelled',
                ).length,
            },
        };
    }, [data, today, clinic]);

    const save = async () => {
        if (!patient || !draft || !clinic) {
            return;
        }

        const next: typeof errors = {};
        const phoneChanged = draft.phone.trim() !== saved?.phone;

        if (phoneChanged && digitsOf(draft.phone).length < 10) {
            next.phone = t('reception.patient.errPhone');
        }

        setErrors(next);

        if (next.phone) {
            return;
        }

        setSaving(true);

        try {
            await source.patients.update(patient.id, {
                ...(phoneChanged ? { phone: draft.phone.trim() } : {}),
                preferredLocale: draft.preferredLocale,
                preferredChannel: draft.preferredChannel,
                consent: draft.consent,
                notes: draft.notes,
            });
            notify('success', t('reception.patient.saved'));
            query.reload();
        } catch (caught) {
            const { field, message } = forField(caught);

            setErrors(
                field === 'phone'
                    ? { phone: message }
                    : { form: t('reception.patient.saveFailed') },
            );
        } finally {
            setSaving(false);
        }
    };

    const describe = (row: AppointmentRow) =>
        t('reception.patient.withDoctor', {
            service: row.service.name,
            doctor: row.doctor.name,
        });

    const stamp = (row: AppointmentRow, future: boolean) => {
        if (!clinic || !today) {
            return '';
        }

        const date = localDate(row.appointment.startsAt, clinic.timezone);
        const clock = formatClock(row.appointment.startsAt, clinic.timezone);
        const day = future
            ? (() => {
                  const { key, count } = relativeDay(date, today);

                  return t(`reception.day.${key}`, { count });
              })()
            : formatShortDate(date, locale);

        return `${day}, ${clock}`;
    };

    return (
        <>
            <Head title={patient?.name ?? t('reception.patient.title')} />
            <PageBody>
                {query.status === 'loading' && (
                    <PageLoading
                        label={t('states.loading')}
                        blocks={[64, 420]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data === null && (
                    <NotFoundPanel
                        title={t('reception.patient.notFoundTitle')}
                        body={t('reception.patient.notFoundBody')}
                        backHref="/reception/patients"
                        backLabel={t('reception.notFoundBack')}
                    />
                )}

                {query.status === 'ready' && patient && clinic && draft && (
                    <>
                        <PageHeader
                            title={patient.name}
                            leading={
                                <PatientAvatar name={patient.name} size="lg" />
                            }
                            actions={
                                <Button
                                    onClick={() => openBooking({ patient })}
                                >
                                    <CalendarPlus aria-hidden="true" />
                                    {t('reception.patient.book')}
                                </Button>
                            }
                        >
                            {patient.phone ? (
                                <span
                                    dir="ltr"
                                    className="text-start text-control"
                                >
                                    {formatPhone(
                                        patient.phone,
                                        clinic.phoneCountryCode,
                                    )}
                                </span>
                            ) : (
                                <span className="text-control text-subtle">
                                    {t('reception.noPhone')}
                                </span>
                            )}
                        </PageHeader>

                        <div className="flex flex-wrap items-start gap-5">
                            <Card className="flex min-w-0 flex-[1_1_380px] animate-rise flex-col gap-4 p-5 motion-reduce:animate-none">
                                <CardTitle>
                                    {t('reception.patient.contact')}
                                </CardTitle>

                                <FormField
                                    label={t('reception.patient.phone')}
                                    error={errors.phone}
                                    hint={
                                        patient.phone
                                            ? undefined
                                            : t('reception.patient.noPhoneNote')
                                    }
                                >
                                    {(control) => (
                                        <Input
                                            {...control}
                                            type="tel"
                                            inputMode="tel"
                                            dir="ltr"
                                            value={draft.phone}
                                            autoComplete="off"
                                            onChange={(event) =>
                                                setDraft({
                                                    ...draft,
                                                    phone: event.target.value,
                                                })
                                            }
                                            className="text-start"
                                        />
                                    )}
                                </FormField>

                                <ChoiceGroup
                                    label={t('reception.patient.language')}
                                    value={draft.preferredLocale}
                                    options={[
                                        ['ur', t('reception.langName.ur')],
                                        ['en', t('reception.langName.en')],
                                    ]}
                                    onChange={(preferredLocale) =>
                                        setDraft({
                                            ...draft,
                                            preferredLocale:
                                                preferredLocale as Locale,
                                        })
                                    }
                                />
                                <ChoiceGroup
                                    label={t('reception.patient.channel')}
                                    value={draft.preferredChannel}
                                    options={[
                                        ['whatsapp', t('channel.whatsapp')],
                                        ['sms', t('channel.sms')],
                                    ]}
                                    onChange={(preferredChannel) =>
                                        setDraft({
                                            ...draft,
                                            preferredChannel:
                                                preferredChannel as Channel,
                                        })
                                    }
                                />

                                <CheckboxField
                                    checked={draft.consent}
                                    onCheckedChange={(consent) =>
                                        setDraft({ ...draft, consent })
                                    }
                                    label={
                                        <span className="flex flex-col leading-[1.5]">
                                            <strong>
                                                {t('reception.patient.consent')}
                                            </strong>
                                            <span
                                                key={String(draft.consent)}
                                                className="animate-fade text-label font-normal text-copy motion-reduce:animate-none"
                                            >
                                                {draft.consent
                                                    ? t(
                                                          'reception.patient.consentOn',
                                                      )
                                                    : t(
                                                          'reception.patient.consentOff',
                                                      )}
                                            </span>
                                        </span>
                                    }
                                />

                                <TextareaField
                                    label={t('reception.patient.notes')}
                                    rows={3}
                                    hint={t('reception.patient.notesHelp')}
                                    value={draft.notes}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            notes: event.target.value,
                                        })
                                    }
                                />

                                {errors.form && (
                                    <p
                                        role="alert"
                                        className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                                    >
                                        {errors.form}
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                        disabled={!dirty || saving}
                                        onClick={save}
                                    >
                                        {saving && (
                                            <Loader2
                                                aria-hidden="true"
                                                className="animate-spin motion-reduce:animate-none"
                                            />
                                        )}
                                        {t('reception.patient.save')}
                                    </Button>
                                    {dirty && (
                                        <span
                                            role="status"
                                            className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                                        >
                                            {t('reception.patient.unsaved')}
                                        </span>
                                    )}
                                </div>
                            </Card>

                            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
                                <Card className="flex animate-rise flex-col gap-3 p-5 [animation-delay:60ms] motion-reduce:animate-none">
                                    <CardTitle>
                                        {t('reception.patient.summary')}
                                    </CardTitle>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        {[
                                            [
                                                t('reception.patient.visits'),
                                                counts.visits,
                                            ],
                                            [
                                                t('reception.patient.noShows'),
                                                patient.noShowCount,
                                            ],
                                            [
                                                t('reception.patient.cancels'),
                                                counts.cancelled,
                                            ],
                                        ].map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex flex-col rounded-lg border border-line p-3"
                                            >
                                                <span className="text-[24px] leading-[1.3] font-bold text-ink">
                                                    {value}
                                                </span>
                                                <span className="text-label font-semibold">
                                                    {label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                <AppointmentList
                                    title={t('reception.patient.upcoming')}
                                    rows={upcoming}
                                    empty={t('reception.patient.nothingBooked')}
                                    delay={120}
                                    stamp={(row) => stamp(row, true)}
                                    describe={describe}
                                    action={
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                openBooking({ patient })
                                            }
                                        >
                                            <CalendarPlus aria-hidden="true" />
                                            {t('reception.patient.book')}
                                        </Button>
                                    }
                                />
                                <AppointmentList
                                    title={t('reception.patient.past')}
                                    rows={past}
                                    empty={t('reception.patient.noVisits')}
                                    delay={180}
                                    stamp={(row) => stamp(row, false)}
                                    describe={describe}
                                />
                            </div>
                        </div>
                    </>
                )}

                <SampleNote />
            </PageBody>
        </>
    );
}

function ChoiceGroup({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: [string, string][];
    onChange: (value: string) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-col gap-1.5">
            <span className="text-label font-semibold text-ink">{label}</span>
            <div className="flex flex-wrap gap-2">
                {options.map(([key, text]) => (
                    <ChoiceChip
                        key={key}
                        pressed={value === key}
                        onClick={() => onChange(key)}
                    >
                        {text}
                    </ChoiceChip>
                ))}
            </div>
        </div>
    );
}

function AppointmentList({
    title,
    rows,
    empty,
    action,
    delay,
    stamp,
    describe,
}: {
    title: string;
    rows: AppointmentRow[];
    empty: string;
    action?: React.ReactNode;
    delay: number;
    stamp: (row: AppointmentRow) => string;
    describe: (row: AppointmentRow) => string;
}) {
    return (
        <section
            style={{ animationDelay: `${delay}ms` }}
            className="animate-rise overflow-hidden rounded-xl border border-line bg-white motion-reduce:animate-none"
        >
            <h2 className="border-b border-line px-5 py-4 text-lead font-semibold text-ink">
                {title}
            </h2>
            {rows.length === 0 ? (
                <EmptyState
                    icon={CalendarX2}
                    title={empty}
                    action={action}
                    className="py-8"
                />
            ) : (
                <ul>
                    {rows.map((row) => (
                        <li
                            key={row.appointment.id}
                            className="border-b border-line-soft last:border-b-0"
                        >
                            <Link
                                href={`/reception/appointments/${row.appointment.id}`}
                                className="flex min-h-16 flex-wrap items-center justify-between gap-2.5 px-5 py-3 transition-colors duration-150 hover:bg-surface-row"
                            >
                                <span className="flex flex-col leading-[1.4]">
                                    <span
                                        dir="auto"
                                        className="text-control font-semibold text-ink"
                                    >
                                        {stamp(row)}
                                    </span>
                                    <span className="text-label text-copy">
                                        {describe(row)}
                                    </span>
                                </span>
                                <StatusBadge status={row.appointment.status} />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
