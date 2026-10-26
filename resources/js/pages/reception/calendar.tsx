import { Head, Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import {
    DayView,
    MonthView,
    WeekView,
    type MoveHandlers,
} from '@/components/reception/calendar/views';
import {
    APPOINTMENT_STATUSES,
    openDaysOfWeek,
    rangeOf,
    shiftDate,
    toMinutes,
    VIEWS,
    type CalendarView,
} from '@/components/reception/calendar/model';
import { formatLongDate, formatMonthYear } from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { useReception } from '@/components/reception/runtime';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/components/vocamed/booking/format';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { BADGE_SPEC } from '@/components/vocamed/status-badge';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useUrlParams } from '@/hooks/use-url-params';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import {
    DataError,
    defaultService,
    utcToZoned,
    type AppointmentRow,
    type IsoDate,
    type Slot,
} from '@/lib/data';
import { cn } from '@/lib/utils';

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function CalendarPage() {
    const { t, locale } = useT();
    const source = useData();
    const { openBooking, refresh } = useReception();
    const [params, setParams] = useUrlParams({
        view: 'day',
        date: '',
        doctor: 'all',
    });
    const [moving, setMoving] = useState<AppointmentRow | null>(null);
    const [pending, setPending] = useState<{
        row: AppointmentRow;
        startsAt: string;
    } | null>(null);
    const dragging = useRef(false);
    // While a drag is under way the grid must not move, so the banner waits until it ends.
    const [dragActive, setDragActive] = useState(false);

    const view = (VIEWS as string[]).includes(params.view)
        ? (params.view as CalendarView)
        : 'day';

    const query = useView(
        'calendar',
        {
            view,
            // Empty means today: the server decides what today is.
            date: validDate(params.date) ? params.date : null,
            doctorId: params.doctor,
        },
        { emptyFrom: (d) => ({ ...d, rows: [] }) },
    );
    const data = query.data;
    const date: IsoDate | null = data?.date ?? null;
    const doctors = data?.allDoctors;
    const doctorId =
        params.doctor === 'all' ||
        !doctors ||
        doctors.some((d) => d.id === params.doctor)
            ? params.doctor
            : 'all';
    const tz = data?.clinic.timezone ?? 'UTC';

    const rangeLabel = (() => {
        if (!date) {
            return ' ';
        }

        if (view === 'day') {
            return formatLongDate(date, locale, true);
        }

        if (view === 'month') {
            return formatMonthYear(date, locale);
        }

        const open = data ? openDaysOfWeek(data.settings, date) : [];
        const { from, to } = rangeOf('week', date);
        const first = open[0] ?? from;
        const last = open.at(-1) ?? to;
        const noon = (d: string) => new Date(`${d}T12:00:00Z`);

        return new Intl.DateTimeFormat(
            locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB',
            {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            },
        ).formatRange(noon(first), noon(last));
    })();

    const stopMoving = () => {
        dragging.current = false;
        setMoving(null);
        setPending(null);
    };

    const book = (doctor: string, slot: Slot) =>
        openBooking({ doctorId: doctor, startsAt: slot.startsAt });

    /** Finds the free time in the chosen half hour that suits the moved appointment's own service. */
    const askMove = async (row: AppointmentRow, slot: Slot) => {
        const local = utcToZoned(new Date(slot.startsAt), tz);
        const rowStart = Math.floor(toMinutes(local.time) / 30) * 30;

        try {
            const slots = await source.slots.list({
                doctorId: row.appointment.doctorId,
                serviceId: row.appointment.serviceId,
                date: local.date,
            });
            const target = slots.find((s) => {
                const minute = toMinutes(
                    utcToZoned(new Date(s.startsAt), tz).time,
                );

                return (
                    (s.state === 'free' || s.heldByMe) &&
                    minute >= rowStart &&
                    minute < rowStart + 30
                );
            });

            if (!target) {
                notify('error', t('reception.calendar.moveTaken'));

                return;
            }

            setPending({ row, startsAt: target.startsAt });
        } catch {
            notify('error', t('reception.calendar.moveFailed'));
        }
    };

    const confirmMove = async () => {
        if (!pending) {
            return;
        }

        try {
            await source.appointments.reschedule(
                pending.row.appointment.id,
                pending.startsAt,
            );
            notify('success', t('reception.calendar.moved'));
            stopMoving();
            query.reload();
            refresh();
        } catch (caught) {
            notify(
                'error',
                caught instanceof DataError &&
                    caught.code === 'SLOT_UNAVAILABLE'
                    ? t('reception.calendar.moveTaken')
                    : t('reception.calendar.moveFailed'),
            );
            stopMoving();
            query.reload();
        }
    };

    const handlers: MoveHandlers = {
        moving,
        onSelect: setMoving,
        onDragStart: (row) => {
            dragging.current = true;
            setDragActive(true);
            // Redrawing the grid inside the dragstart event makes browsers cancel the drag,
            // so the drop targets are drawn a moment later.
            window.setTimeout(() => setMoving(row), 0);
        },
        onDragEnd: () => {
            setDragActive(false);

            if (dragging.current) {
                dragging.current = false;
                setMoving(null);
            }
        },
        onMoveTo: (row, slot) => void askMove(row, slot),
        onBook: book,
    };

    const bookInWeek = async (day: IsoDate, hour: number) => {
        const doctor = doctors?.find((d) => d.id === doctorId) ?? doctors?.[0];

        if (!doctor) {
            openBooking();

            return;
        }

        const services = await source.services.list();
        const service = defaultService(doctor, services);
        const slots = service
            ? await source.slots.list({
                  doctorId: doctor.id,
                  serviceId: service.id,
                  date: day,
              })
            : [];
        const slot = slots.find(
            (s) =>
                (s.state === 'free' || s.heldByMe) &&
                toMinutes(utcToZoned(new Date(s.startsAt), tz).time) >=
                    hour * 60,
        );

        openBooking({ doctorId: doctor.id, startsAt: slot?.startsAt });
    };

    const nav = (direction: 1 | -1) =>
        date && setParams({ date: shiftDate(view, date, direction) });

    const movingBanner = moving && !dragActive && (
        <div
            role="status"
            className="flex animate-rise flex-wrap items-center justify-between gap-2.5 rounded-lg border border-brand-line bg-brand-tint px-4 py-3 text-control font-semibold text-brand-deep motion-reduce:animate-none"
        >
            <span>
                {t('reception.calendar.moving', { name: moving.patient.name })}
            </span>
            <span className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                    <Link
                        href={`/reception/appointments/${moving.appointment.id}`}
                    >
                        {t('reception.appointments.view')}
                    </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={stopMoving}>
                    {t('reception.calendar.cancelMove')}
                </Button>
            </span>
        </div>
    );

    return (
        <>
            <Head title={t('reception.calendar.title')} />
            <PageBody className="gap-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                        <h1 className="text-heading font-bold text-ink">
                            {t('reception.calendar.title')}
                        </h1>
                        <p
                            key={`${view}${date}`}
                            aria-live="polite"
                            className="animate-fade text-control motion-reduce:animate-none"
                        >
                            {rangeLabel}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('reception.calendar.previous')}
                                onClick={() => nav(-1)}
                            >
                                <ChevronLeft
                                    aria-hidden="true"
                                    className="rtl:-scale-x-100"
                                />
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setParams({ date: '' })}
                            >
                                {t('reception.calendar.goToday')}
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('reception.calendar.next')}
                                onClick={() => nav(1)}
                            >
                                <ChevronRight
                                    aria-hidden="true"
                                    className="rtl:-scale-x-100"
                                />
                            </Button>
                        </div>
                        <div
                            role="group"
                            aria-label={t('reception.calendar.views')}
                            className="inline-flex rounded-md border border-line bg-surface-subtle p-[3px]"
                        >
                            {VIEWS.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    aria-pressed={view === v}
                                    onClick={() => {
                                        stopMoving();
                                        setParams({ view: v });
                                    }}
                                    className={cn(
                                        'min-h-11 min-w-[76px] rounded-sm px-3.5 text-[14.5px] font-semibold transition-colors duration-150',
                                        view === v
                                            ? 'bg-brand-tint text-brand-deep'
                                            : 'text-copy hover:bg-surface-hover',
                                    )}
                                >
                                    {t(`reception.calendar.${v}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div
                    role="group"
                    aria-label={t('reception.calendar.doctor')}
                    className="flex flex-wrap items-center gap-2"
                >
                    <span className="me-1.5 text-label font-semibold text-ink">
                        {t('reception.calendar.doctor')}
                    </span>
                    <ChoiceChip
                        shape="pill"
                        pressed={doctorId === 'all'}
                        onClick={() => {
                            stopMoving();
                            setParams({ doctor: 'all' });
                        }}
                    >
                        {t('reception.calendar.all')}
                    </ChoiceChip>
                    {(doctors ?? []).map((doctor) => (
                        <ChoiceChip
                            key={doctor.id}
                            shape="pill"
                            pressed={doctorId === doctor.id}
                            onClick={() => {
                                stopMoving();
                                setParams({ doctor: doctor.id });
                            }}
                        >
                            {doctor.name}
                        </ChoiceChip>
                    ))}
                </div>

                <ul
                    aria-label={t('reception.calendar.legend')}
                    className="flex flex-wrap items-center gap-x-2.5 gap-y-2"
                >
                    {APPOINTMENT_STATUSES.map((key) => {
                        const spec = BADGE_SPEC[key];
                        const Icon = spec.icon;

                        return (
                            <li
                                key={key}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold',
                                    spec.className,
                                )}
                            >
                                <Icon
                                    aria-hidden="true"
                                    className="size-[13px]"
                                />
                                {t(spec.label)}
                            </li>
                        );
                    })}
                    <li className="inline-flex items-center rounded-full border border-dashed border-line-dashed held-stripes px-2.5 py-[3px] text-[12.5px] font-semibold text-ink-soft">
                        {t('reception.calendar.held')}
                    </li>
                </ul>

                {movingBanner}

                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}
                {(query.status === 'loading' ||
                    (!data && query.status === 'ready')) && (
                    <PageLoading label={t('states.loading')} blocks={[480]} />
                )}

                {query.status === 'ready' && data && date && (
                    <div
                        className="animate-fade motion-reduce:animate-none"
                        key={`${view}${date}${doctorId}`}
                    >
                        {view === 'day' && (
                            <>
                                {data.rows.length === 0 && (
                                    <p className="mb-3 rounded-lg border border-line bg-surface-subtle px-4 py-3 text-control">
                                        <strong className="text-ink">
                                            {t('reception.calendar.empty')}
                                        </strong>{' '}
                                        {t('reception.calendar.emptyBody')}
                                    </p>
                                )}
                                <DayView
                                    data={data}
                                    date={date}
                                    handlers={handlers}
                                />
                            </>
                        )}
                        {view === 'week' && (
                            <WeekView
                                data={data}
                                date={date}
                                onBook={(day, hour) =>
                                    void bookInWeek(day, hour)
                                }
                            />
                        )}
                        {view === 'month' && (
                            <MonthView
                                data={data}
                                date={date}
                                onOpenDay={(day) =>
                                    setParams({ view: 'day', date: day })
                                }
                            />
                        )}
                    </div>
                )}

                <p className="text-label text-subtle">
                    {t('reception.calendar.hint')} · {t('common.sample')}
                </p>
                <SampleNote className="sr-only" />
            </PageBody>

            <ConfirmDialog
                tone="default"
                open={pending !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        stopMoving();
                    }
                }}
                title={t('reception.calendar.moveTitle')}
                description={
                    pending
                        ? t('reception.calendar.moveText', {
                              name: pending.row.patient.name,
                              from: formatClock(
                                  pending.row.appointment.startsAt,
                                  tz,
                              ),
                              to: formatClock(pending.startsAt, tz),
                              doctor: pending.row.doctor.name,
                          })
                        : ''
                }
                confirmLabel={t('reception.calendar.yesMove')}
                cancelLabel={t('reception.calendar.keepOriginal')}
                onConfirm={confirmMove}
            />
        </>
    );
}
