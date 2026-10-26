import { Head } from '@inertiajs/react';
import { Mic } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DoctorSchedule } from '@/components/reception/doctor-schedule';
import { formatLongDate } from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import {
    defaultService,
    loadToday,
    type Row,
} from '@/components/reception/queries';
import { useReception } from '@/components/reception/runtime';
import { SummaryStrip } from '@/components/reception/stat-card';
import {
    WalkInForm,
    type WalkInInput,
} from '@/components/reception/walk-in-form';
import { Button } from '@/components/ui/button';
import { notify } from '@/components/vocamed/toast';
import { useChangedKeys } from '@/hooks/use-changed-keys';
import { useData } from '@/hooks/use-data';
import { useLiveQuery } from '@/hooks/use-live-query';
import { clockMs } from '@/lib/clock';
import { useT } from '@/i18n/scope';
import { DataError, utcToZoned, type AppointmentStatus } from '@/lib/data';

export default function Today() {
    const { t, locale } = useT();
    const source = useData();
    const { openBooking, openVoice } = useReception();
    const query = useLiveQuery('today', loadToday, {
        emptyFrom: (d) => ({
            ...d,
            days: d.days.map((day) => ({ ...day, rows: [] })),
        }),
    });
    const [pending, setPending] = useState<{
        id: string;
        stage: AppointmentStatus;
    } | null>(null);
    // Statuses saved here show at once; the next load replaces them with the server's.
    const [overrides, setOverrides] = useState<
        Record<string, AppointmentStatus>
    >({});
    const [announcement, setAnnouncement] = useState('');

    const data = query.data;

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverrides({});
    }, [data]);

    const days = useMemo(
        () =>
            data?.days.map((day) => ({
                ...day,
                rows: day.rows.map((row) => ({
                    ...row,
                    appointment: {
                        ...row.appointment,
                        status:
                            overrides[row.appointment.id] ??
                            row.appointment.status,
                    },
                })),
            })),
        [data, overrides],
    );

    const allRows = useMemo(
        () => data?.days.flatMap((day) => day.rows),
        [data],
    );
    const changed = useChangedKeys(
        allRows,
        (row) => row.appointment.id,
        (row) => row.appointment.status,
    );

    const counts = useMemo(() => {
        const rows = days?.flatMap((d) => d.rows) ?? [];
        const count = (...statuses: AppointmentStatus[]) =>
            rows.filter((r) => statuses.includes(r.appointment.status)).length;

        return {
            open: count('booked', 'confirmed'),
            arrived: count('arrived'),
            consult: count('in_consultation'),
            done: count('done'),
            noShow: count('no_show'),
        };
    }, [days]);

    const toggle = async (row: Row, stage: AppointmentStatus) => {
        const id = row.appointment.id;
        const undo = row.appointment.status === stage;
        setPending({ id, stage });

        try {
            const next = undo
                ? await source.appointments.undoStatus(id)
                : await source.appointments.setStatus(id, stage);
            setOverrides((o) => ({ ...o, [id]: next.status }));
            setAnnouncement(
                t(undo ? 'reception.today.undone' : 'reception.today.changed', {
                    patient: row.patient.name,
                    status: t(`status.${next.status}`),
                }),
            );
            query.reload();
        } catch {
            notify('error', t('reception.today.changeFailed'));
        } finally {
            setPending(null);
        }
    };

    const addWalkIn = async (input: WalkInInput) => {
        if (!data) {
            return;
        }

        const day = data.days.find((d) => d.doctor.id === input.doctorId);
        const service = day && defaultService(day.doctor, data.services);

        if (!day || !service) {
            throw new Error('no service');
        }

        try {
            const digits = input.phone.replace(/\D/g, '').replace(/^0/, '');
            const existing = digits
                ? (await source.patients.search(input.phone, 3)).find((p) =>
                      p.phone.replace(/\D/g, '').endsWith(digits),
                  )
                : undefined;
            const patient =
                existing ??
                (await source.patients.create({
                    name: input.name,
                    phone: input.phone,
                    noPhone: !input.phone,
                }));
            // The doctor's next free time today, otherwise right now.
            const slotToday =
                day.nextFree &&
                utcToZoned(
                    new Date(day.nextFree.startsAt),
                    data.clinic.timezone,
                ).date === data.today
                    ? day.nextFree.startsAt
                    : new Date(
                          Math.floor(clockMs() / 60_000) * 60_000,
                      ).toISOString();

            await source.appointments.create({
                patientId: patient.id,
                doctorId: day.doctor.id,
                serviceId: service.id,
                startsAt: slotToday,
                source: 'walk_in',
            });
            notify(
                'success',
                t('reception.today.added', {
                    name: patient.name,
                    doctor: day.doctor.name,
                }),
            );
            query.reload();
        } catch (caught) {
            notify(
                'error',
                caught instanceof DataError
                    ? caught.message
                    : t('reception.today.changeFailed'),
            );
            throw caught;
        }
    };

    const clinicZone = data?.clinic.timezone;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
        <>
            <Head title={t('reception.today.title')} />
            <PageBody>
                <PageHeader
                    title={t('reception.today.title')}
                    lead={
                        <>
                            {data ? formatLongDate(data.today, locale) : ' '}
                            {' · '}
                            <span dir="ltr">{t('common.sample')}</span>
                            {clinicZone && clinicZone !== browserZone && (
                                <>
                                    {' · '}
                                    {t('reception.timeZone', {
                                        zone: clinicZone,
                                    })}
                                </>
                            )}
                        </>
                    }
                    actions={
                        <>
                            <span className="text-small text-subtle">
                                {t('reception.shortcuts')}
                            </span>
                            <Button variant="outline" onClick={openVoice}>
                                <Mic
                                    aria-hidden="true"
                                    className="size-5 text-brand"
                                />
                                {t('reception.today.speak')}
                                <kbd
                                    aria-hidden="true"
                                    className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-xs bg-surface-hover px-1.5 font-sans text-caption font-bold"
                                >
                                    M
                                </kbd>
                            </Button>
                        </>
                    }
                />

                <p role="status" className="sr-only">
                    {announcement}
                </p>

                {query.status === 'loading' && (
                    <PageLoading label={t('reception.today.loading')} />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && days && (
                    <>
                        <SummaryStrip
                            label={t('reception.today.summary')}
                            items={[
                                {
                                    key: 'open',
                                    label: t(
                                        'reception.today.bookedOrConfirmed',
                                    ),
                                    value: counts.open,
                                },
                                {
                                    key: 'arrived',
                                    label: t('status.arrived'),
                                    value: counts.arrived,
                                },
                                {
                                    key: 'consult',
                                    label: t('status.in_consultation'),
                                    value: counts.consult,
                                },
                                {
                                    key: 'done',
                                    label: t('status.done'),
                                    value: counts.done,
                                },
                                {
                                    key: 'noshow',
                                    label: t('status.no_show'),
                                    value: counts.noShow,
                                },
                            ]}
                        />

                        <WalkInForm
                            doctors={data.days.map((d) => d.doctor)}
                            onAdd={addWalkIn}
                        />

                        {days.map((day, index) => (
                            <DoctorSchedule
                                key={day.doctor.id}
                                day={day}
                                today={data.today}
                                timeZone={data.clinic.timezone}
                                changed={changed}
                                pending={pending}
                                onToggle={toggle}
                                onBook={(doctorId) => openBooking({ doctorId })}
                                index={index}
                            />
                        ))}
                    </>
                )}

                <SampleNote />
            </PageBody>
        </>
    );
}
