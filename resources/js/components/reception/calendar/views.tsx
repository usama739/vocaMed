import { Link } from '@inertiajs/react';
import { useMemo } from 'react';
import {
    formatShortDate,
    formatWeekdayShort,
    initialsOf,
    localDate,
} from '@/components/reception/format';
import { formatClock } from '@/components/vocamed/booking/format';
import { BADGE_SPEC } from '@/components/vocamed/status-badge';
import { useT } from '@/i18n/scope';
import {
    type AppointmentRow,
    utcToZoned,
    weekdayOf,
    type IsoDate,
    type Slot,
} from '@/lib/data';
import { cn } from '@/lib/utils';
import {
    cellState,
    dayRowTimes,
    hoursFor,
    monthGrid,
    openDaysOfWeek,
    toMinutes,
    type CalendarData,
    type ColumnData,
} from './model';

/** Read-only mode (the doctor's schedule): events open a panel, nothing can be booked or moved. */
export type ReadOnly = { onOpen: (row: AppointmentRow) => void };

const NO_HANDLERS: MoveHandlers = {
    moving: null,
    onSelect: () => undefined,
    onDragStart: () => undefined,
    onDragEnd: () => undefined,
    onMoveTo: () => undefined,
    onBook: () => undefined,
};

export type MoveHandlers = {
    /** The appointment being moved (selected or dragged). */
    moving: AppointmentRow | null;
    onSelect: (row: AppointmentRow | null) => void;
    onDragStart: (row: AppointmentRow) => void;
    onDragEnd: () => void;
    onMoveTo: (row: AppointmentRow, slot: Slot) => void;
    onBook: (doctorId: string, slot: Slot) => void;
};

/** One appointment, drawn in its status colours, draggable when it can still be moved. */
function EventCard({
    row,
    timeZone,
    rowTime,
    handlers,
    readOnly,
}: {
    row: AppointmentRow;
    timeZone: string;
    rowTime: string;
    handlers: MoveHandlers;
    readOnly?: ReadOnly;
}) {
    const { t } = useT();
    const { appointment, patient, service } = row;
    const spec = BADGE_SPEC[appointment.status];
    const Icon = spec.icon;
    const clock = formatClock(appointment.startsAt, timeZone);
    const picked = handlers.moving?.appointment.id === appointment.id;
    const movable = row.allowed.canReschedule;
    const label = t(spec.label);
    const aria = t('reception.calendar.eventAria', {
        patient: patient.name,
        status: label,
        time: clock,
    });
    const body = (
        <>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
            </span>
            <span className="text-start text-control font-bold">
                {patient.name}
            </span>
            <span className="text-small">
                {service.name}
                {clock !== rowTime && (
                    <>
                        {' · '}
                        <span dir="ltr">{clock}</span>
                    </>
                )}
            </span>
        </>
    );
    const base = cn(
        'flex flex-1 flex-col items-start gap-0.5 rounded-md border-2 px-3 py-2.5 transition-[transform,box-shadow,opacity] duration-200 ease-out',
        spec.className,
        picked ? 'border-brand shadow-lift' : 'border-transparent',
    );

    if (readOnly) {
        return (
            <button
                type="button"
                aria-label={aria}
                onClick={() => readOnly.onOpen(row)}
                className={cn(base, 'hover:-translate-y-px hover:shadow-card')}
            >
                {body}
            </button>
        );
    }

    if (!movable) {
        return (
            <Link
                href={`/reception/appointments/${appointment.id}`}
                aria-label={aria}
                className={cn(base, 'hover:-translate-y-px hover:shadow-card')}
            >
                {body}
            </Link>
        );
    }

    return (
        <button
            type="button"
            draggable
            aria-pressed={picked}
            aria-label={`${aria}. ${t('reception.calendar.eventPick')}`}
            onClick={() => handlers.onSelect(picked ? null : row)}
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', appointment.id);
                handlers.onDragStart(row);
            }}
            onDragEnd={handlers.onDragEnd}
            className={cn(
                base,
                'cursor-grab hover:-translate-y-px hover:shadow-card active:cursor-grabbing',
                picked && 'opacity-90',
            )}
        >
            {body}
        </button>
    );
}

export function DayView({
    data,
    date,
    handlers = NO_HANDLERS,
    readOnly,
}: {
    data: CalendarData;
    date: IsoDate;
    handlers?: MoveHandlers;
    readOnly?: ReadOnly;
}) {
    const { t } = useT();
    const tz = data.clinic.timezone;
    const times = useMemo(() => dayRowTimes(data, date), [data, date]);
    const columns = data.columns;
    const grid = {
        gridTemplateColumns: `72px repeat(${Math.max(columns.length, 1)}, minmax(220px, 1fr))`,
    };
    const moving = handlers.moving;

    const droppable = (column: ColumnData) =>
        !!moving && moving.appointment.doctorId === column.doctor.id;

    return (
        <div className="overflow-x-auto rounded-xl border border-line">
            <div
                role="table"
                aria-label={
                    readOnly
                        ? t('doctor.schedule.dayGrid')
                        : t('reception.calendar.dayGrid')
                }
                style={{ minWidth: 72 + columns.length * 220 }}
            >
                <div
                    role="row"
                    style={grid}
                    className="grid border-b border-line bg-surface-subtle"
                >
                    <span
                        role="columnheader"
                        className="px-3.5 py-3 text-small font-semibold text-subtle"
                    >
                        {t('reception.calendar.time')}
                    </span>
                    {columns.map((column) => (
                        <span
                            key={column.doctor.id}
                            role="columnheader"
                            className="flex items-center gap-2.5 border-s border-line px-3.5 py-3 text-control font-bold text-ink"
                        >
                            <span
                                aria-hidden="true"
                                className="inline-flex size-7 items-center justify-center rounded-full bg-brand-tint text-caption font-bold text-brand-deep"
                            >
                                {initialsOf(column.doctor.name)}
                            </span>
                            {column.doctor.name}
                        </span>
                    ))}
                </div>

                {times.length === 0 && (
                    <p className="px-5 py-10 text-center text-control">
                        {t('reception.calendar.closed')}
                    </p>
                )}

                {times.map((time) => (
                    <div
                        key={time}
                        role="row"
                        style={grid}
                        className="grid min-h-[84px] border-b border-line-soft last:border-b-0"
                    >
                        <span
                            role="rowheader"
                            dir="ltr"
                            className="px-3.5 py-3 text-start text-label font-bold text-ink"
                        >
                            {time}
                        </span>
                        {columns.map((column) => {
                            const cell = cellState(
                                column,
                                time,
                                date,
                                data,
                                data.rows,
                            );

                            return (
                                <div
                                    key={column.doctor.id}
                                    role="cell"
                                    className="flex border-s border-line-soft p-1.5"
                                    onDragOver={(event) => {
                                        if (
                                            cell.kind === 'free' &&
                                            droppable(column)
                                        ) {
                                            event.preventDefault();
                                        }
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();

                                        if (
                                            cell.kind === 'free' &&
                                            moving &&
                                            droppable(column)
                                        ) {
                                            handlers.onMoveTo(
                                                moving,
                                                cell.slot,
                                            );
                                        }
                                    }}
                                >
                                    <Cell
                                        cell={cell}
                                        column={column}
                                        time={time}
                                        timeZone={tz}
                                        droppable={droppable(column)}
                                        handlers={handlers}
                                        readOnly={readOnly}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Cell({
    cell,
    column,
    time,
    timeZone,
    droppable,
    handlers,
    readOnly,
}: {
    cell: ReturnType<typeof cellState>;
    column: ColumnData;
    time: string;
    timeZone: string;
    droppable: boolean;
    handlers: MoveHandlers;
    readOnly?: ReadOnly;
}) {
    const { t } = useT();
    const moving = handlers.moving;

    if (cell.kind === 'events') {
        return (
            <div className="flex flex-1 flex-col gap-1.5">
                {cell.rows.map((row) => (
                    <EventCard
                        key={row.appointment.id}
                        row={row}
                        timeZone={timeZone}
                        rowTime={time}
                        handlers={handlers}
                        readOnly={readOnly}
                    />
                ))}
            </div>
        );
    }

    if (cell.kind === 'free' && readOnly) {
        return (
            <span className="flex flex-1 items-center ps-2 text-[13.5px] text-mute">
                {t('doctor.schedule.free')}
            </span>
        );
    }

    if (cell.kind === 'free') {
        const target = !!moving && droppable;
        const blocked = !!moving && !droppable;

        return (
            <button
                type="button"
                disabled={blocked}
                aria-label={t(
                    target
                        ? 'reception.calendar.moveAria'
                        : 'reception.calendar.slotAria',
                    { time, doctor: column.doctor.name },
                )}
                onClick={() =>
                    moving
                        ? handlers.onMoveTo(moving, cell.slot)
                        : handlers.onBook(column.doctor.id, cell.slot)
                }
                className={cn(
                    'flex min-h-16 flex-1 items-center justify-center rounded-md border border-dashed text-label font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
                    target
                        ? 'border-brand bg-brand-tint/60 text-brand-deep hover:bg-brand-tint'
                        : 'border-line-strong bg-transparent text-subtle hover:border-brand hover:bg-brand-tint hover:text-brand-deep',
                )}
            >
                {target
                    ? t('reception.calendar.moveHere')
                    : `+ ${t('reception.calendar.book')}`}
            </button>
        );
    }

    if (cell.kind === 'held') {
        return (
            <div className="flex flex-1 animate-soft-pulse items-center justify-center rounded-md border border-dashed border-line-dashed held-stripes text-[13.5px] font-bold text-ink-soft motion-reduce:animate-none">
                {t('reception.calendar.held')}
            </div>
        );
    }

    if (cell.kind === 'off') {
        return (
            <div className="flex flex-1 items-center justify-center rounded-md bg-surface-subtle text-small font-semibold text-subtle">
                {cell.reason === 'timeOff'
                    ? t('reception.calendar.timeOff')
                    : t('reception.calendar.closed')}
            </div>
        );
    }

    return (
        <div
            aria-hidden="true"
            className={cn(
                'flex-1 rounded-md',
                cell.kind === 'past'
                    ? 'bg-surface-subtle/70'
                    : 'bg-surface-subtle/40',
            )}
        />
    );
}

/** A week-view chip: a link to the appointment, or (read only) a button that opens the panel. */
function ChipShell({
    row,
    readOnly,
    className,
    children,
}: {
    row: AppointmentRow;
    readOnly?: ReadOnly;
    className?: string;
    children: React.ReactNode;
}) {
    if (readOnly) {
        return (
            <button
                type="button"
                onClick={() => readOnly.onOpen(row)}
                className={cn(className, 'w-full items-start text-start')}
            >
                {children}
            </button>
        );
    }

    return (
        <Link
            href={`/reception/appointments/${row.appointment.id}`}
            className={className}
        >
            {children}
        </Link>
    );
}

/** The week's open days (Monday first) with hourly rows and small appointment chips. */
export function WeekView({
    data,
    date,
    onBook,
    readOnly,
}: {
    data: CalendarData;
    date: IsoDate;
    onBook?: (date: IsoDate, hour: number) => void;
    readOnly?: ReadOnly;
}) {
    const { t, locale } = useT();
    const tz = data.clinic.timezone;
    const days = openDaysOfWeek(data.settings, date);

    const bounds = days.map((d) => hoursFor(data.settings, weekdayOf(d))!);
    const eventHours = data.rows.map(({ appointment }) =>
        Math.floor(
            toMinutes(utcToZoned(new Date(appointment.startsAt), tz).time) / 60,
        ),
    );
    const first = Math.min(
        ...bounds.map((b) => Math.floor(toMinutes(b.open) / 60)),
        ...eventHours,
    );
    const last = Math.max(
        ...bounds.map((b) => Math.ceil(toMinutes(b.close) / 60)),
        ...eventHours.map((h) => h + 1),
    );
    const hours = Number.isFinite(first)
        ? Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i)
        : [];
    const grid = {
        gridTemplateColumns: `72px repeat(${Math.max(days.length, 1)}, minmax(130px, 1fr))`,
    };
    const showDoctor = data.doctors.length > 1;

    return (
        <div className="overflow-x-auto rounded-xl border border-line">
            <div
                role="table"
                aria-label={
                    readOnly
                        ? t('doctor.schedule.weekGrid')
                        : t('reception.calendar.weekGrid')
                }
                style={{ minWidth: 72 + days.length * 130 }}
            >
                <div
                    role="row"
                    style={grid}
                    className="grid border-b border-line bg-surface-subtle"
                >
                    <span
                        role="columnheader"
                        className="px-3.5 py-3 text-small font-semibold text-subtle"
                    >
                        {t('reception.calendar.time')}
                    </span>
                    {days.map((d) => (
                        <span
                            key={d}
                            role="columnheader"
                            className={cn(
                                'border-s border-line px-3.5 py-3 text-label font-bold text-ink',
                                d === data.today &&
                                    'bg-brand-tint text-brand-deep',
                            )}
                        >
                            {formatWeekdayShort(d, locale)}{' '}
                            <span dir="ltr">{Number(d.slice(8, 10))}</span>
                        </span>
                    ))}
                </div>
                {hours.map((hour) => (
                    <div
                        key={hour}
                        role="row"
                        style={grid}
                        className="grid min-h-[112px] border-b border-line-soft last:border-b-0"
                    >
                        <span
                            role="rowheader"
                            dir="ltr"
                            className="px-3.5 py-3 text-start text-label font-bold text-ink"
                        >
                            {String(hour).padStart(2, '0')}:00
                        </span>
                        {days.map((d) => {
                            const items = data.rows
                                .filter(({ appointment }) => {
                                    const local = utcToZoned(
                                        new Date(appointment.startsAt),
                                        tz,
                                    );

                                    return (
                                        local.date === d &&
                                        Math.floor(
                                            toMinutes(local.time) / 60,
                                        ) === hour
                                    );
                                })
                                .sort((a, b) =>
                                    a.appointment.startsAt.localeCompare(
                                        b.appointment.startsAt,
                                    ),
                                );
                            const time = `${String(hour).padStart(2, '0')}:00`;

                            return (
                                <div
                                    key={d}
                                    role="cell"
                                    className="flex flex-col gap-1 border-s border-line-soft p-1.5"
                                >
                                    {items.map((row) => {
                                        const spec =
                                            BADGE_SPEC[row.appointment.status];
                                        const Icon = spec.icon;

                                        return (
                                            <ChipShell
                                                key={row.appointment.id}
                                                row={row}
                                                readOnly={readOnly}
                                                className={cn(
                                                    'flex min-h-11 flex-col justify-center gap-px rounded-sm px-2 py-1.5 transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-card',
                                                    spec.className,
                                                )}
                                            >
                                                <span className="inline-flex items-center gap-1.5 text-caption font-bold">
                                                    <Icon
                                                        aria-hidden="true"
                                                        className="size-3"
                                                    />
                                                    <span dir="ltr">
                                                        {formatClock(
                                                            row.appointment
                                                                .startsAt,
                                                            tz,
                                                        )}
                                                    </span>
                                                    {t(spec.label)}
                                                </span>
                                                <span className="text-[13.5px] font-bold">
                                                    {row.patient.name}
                                                    {showDoctor && (
                                                        <span className="ms-1 font-semibold opacity-70">
                                                            ·{' '}
                                                            {initialsOf(
                                                                row.doctor.name,
                                                            )}
                                                        </span>
                                                    )}
                                                </span>
                                            </ChipShell>
                                        );
                                    })}
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            aria-label={t(
                                                'reception.calendar.slotAria',
                                                {
                                                    time,
                                                    doctor: formatWeekdayShort(
                                                        d,
                                                        locale,
                                                    ),
                                                },
                                            )}
                                            onClick={() => onBook?.(d, hour)}
                                            className="mt-auto min-h-11 rounded-md border border-dashed border-line-strong text-small font-semibold text-subtle transition-colors duration-150 hover:border-brand hover:bg-brand-tint hover:text-brand-deep"
                                        >
                                            +
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Month overview: a count per day, today highlighted. Choosing a day opens it in the day view. */
export function MonthView({
    data,
    date,
    onOpenDay,
}: {
    data: CalendarData;
    date: IsoDate;
    onOpenDay: (date: IsoDate) => void;
}) {
    const { t, locale } = useT();
    const tz = data.clinic.timezone;
    const cells = monthGrid(date);
    const counts = new Map<IsoDate, number>();

    for (const { appointment } of data.rows) {
        if (appointment.status === 'cancelled') {
            continue;
        }

        const day = localDate(appointment.startsAt, tz);
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }

    // Any Monday works: only the weekday names are used.
    const heads = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 9, 26 + i));

        return d.toISOString().slice(0, 10);
    });

    return (
        <div className="overflow-x-auto rounded-xl border border-line">
            <div
                role="table"
                aria-label={t('reception.calendar.monthGrid')}
                className="min-w-[760px]"
            >
                <div
                    role="row"
                    className="grid grid-cols-7 border-b border-line bg-surface-subtle"
                >
                    {heads.map((d) => (
                        <span
                            key={d}
                            role="columnheader"
                            className="px-3.5 py-3 text-small font-semibold text-subtle"
                        >
                            {formatWeekdayShort(d, locale)}
                        </span>
                    ))}
                </div>
                <div role="rowgroup" className="grid grid-cols-7">
                    {cells.map((d, index) => {
                        if (!d) {
                            return (
                                <div
                                    key={`blank-${index}`}
                                    role="cell"
                                    aria-hidden="true"
                                    className="min-h-24 border-s border-b border-line-soft bg-surface-row"
                                />
                            );
                        }

                        const count = counts.get(d) ?? 0;
                        const open = !!hoursFor(data.settings, weekdayOf(d));
                        const isToday = d === data.today;

                        return (
                            <button
                                key={d}
                                type="button"
                                role="cell"
                                onClick={() => onOpenDay(d)}
                                aria-label={`${t('reception.calendar.openDay', {
                                    date: formatShortDate(d, locale),
                                })}${count ? `, ${t('reception.calendar.appts', { count })}` : ''}${isToday ? `, ${t('reception.day.today')}` : ''}`}
                                className={cn(
                                    'flex min-h-24 flex-col items-start gap-1.5 border-s border-b border-line-soft p-3 text-start text-copy transition-colors duration-150 hover:bg-surface-hover',
                                    isToday
                                        ? 'bg-brand-tint'
                                        : open
                                          ? 'bg-white'
                                          : 'bg-surface-subtle',
                                )}
                            >
                                <span
                                    dir="ltr"
                                    className={cn(
                                        'text-control font-bold text-ink',
                                        isToday && 'text-brand-deep',
                                    )}
                                >
                                    {Number(d.slice(8, 10))}
                                </span>
                                <span className="text-[12.5px] font-semibold">
                                    {count
                                        ? t('reception.calendar.appts', {
                                              count,
                                          })
                                        : open
                                          ? ''
                                          : t('reception.calendar.closed')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
