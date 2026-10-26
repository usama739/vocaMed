import {
    addDaysToDate,
    utcToZoned,
    weekdayOf,
    zonedToUtc,
    type Clinic,
    type ClinicSettings,
    type DataSource,
    type Doctor,
    type DoctorAvailability,
    type IsoDate,
    type Service,
    type Slot,
} from '@/lib/data';
import {
    defaultService,
    toRows,
    type Row,
} from '@/components/reception/queries';
import { todayIn } from '@/components/reception/format';
import { clockMs, clockNow } from '@/lib/clock';

export type CalendarView = 'day' | 'week' | 'month';
export const VIEWS: CalendarView[] = ['day', 'week', 'month'];

/** Day-view rows are half hours. */
export const STEP_MIN = 30;

export const toMinutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const fromMinutes = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Monday of the week that contains `date`. */
export function weekStart(date: IsoDate): IsoDate {
    const offset = (weekdayOf(date) + 6) % 7;

    return addDaysToDate(date, -offset);
}

export function monthStart(date: IsoDate): IsoDate {
    return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: IsoDate): IsoDate {
    const first = monthStart(date);
    const next = addDaysToDate(first, 32).slice(0, 7);

    return addDaysToDate(`${next}-01`, -1);
}

/** The dates shown for a view: one day, the week's open days, or a full month grid. */
export function rangeOf(
    view: CalendarView,
    date: IsoDate,
): { from: IsoDate; to: IsoDate } {
    if (view === 'day') {
        return { from: date, to: date };
    }

    if (view === 'week') {
        const from = weekStart(date);

        return { from, to: addDaysToDate(from, 6) };
    }

    return { from: monthStart(date), to: monthEnd(date) };
}

/** Moves the anchor by one page of the current view. */
export function shiftDate(
    view: CalendarView,
    date: IsoDate,
    direction: 1 | -1,
): IsoDate {
    if (view === 'day') {
        return addDaysToDate(date, direction);
    }

    if (view === 'week') {
        return addDaysToDate(date, 7 * direction);
    }

    const base =
        direction === 1
            ? addDaysToDate(monthEnd(date), 1)
            : addDaysToDate(monthStart(date), -1);

    return monthStart(base);
}

/** Month grid: Monday-first weeks, `null` for days outside the month. */
export function monthGrid(date: IsoDate): (IsoDate | null)[] {
    const first = monthStart(date);
    const last = monthEnd(date);
    const lead = (weekdayOf(first) + 6) % 7;
    const days = Number(last.slice(8, 10));
    const cells: (IsoDate | null)[] = Array.from({ length: lead }, () => null);

    for (let d = 0; d < days; d++) {
        cells.push(addDaysToDate(first, d));
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
}

export type ColumnData = {
    doctor: Doctor;
    service: Service | undefined;
    slots: Slot[];
    availability: DoctorAvailability;
    /** Time off or a clinic holiday on this date. */
    offToday: boolean;
};

export type CalendarData = {
    clinic: Clinic;
    settings: ClinicSettings;
    today: IsoDate;
    doctors: Doctor[];
    rows: Row[];
    /** Day view only. */
    columns: ColumnData[];
    nowIso: string;
};

/** Everything one calendar page needs. The day view also loads each column's slots. */
export async function loadCalendar(
    source: DataSource,
    view: CalendarView,
    date: IsoDate,
    doctorId: string,
): Promise<CalendarData> {
    const clinic = await source.clinic.get();
    const range = rangeOf(view, date);
    const [settings, allDoctors, services, page] = await Promise.all([
        source.clinic.settings(),
        source.doctors.list({ activeOnly: true }),
        source.services.list(),
        source.appointments.list({
            from: range.from,
            to: range.to,
            ...(doctorId !== 'all' ? { doctorId } : {}),
            perPage: 2000,
        }),
    ]);
    const doctors =
        doctorId === 'all'
            ? allDoctors
            : allDoctors.filter((d) => d.id === doctorId);
    const rows = await toRows(source, page.items);
    const today = todayIn(clinic.timezone);

    let columns: ColumnData[] = [];

    if (view === 'day') {
        columns = await Promise.all(
            doctors.map(async (doctor) => {
                const service = defaultService(doctor, services);
                const [availability, slots] = await Promise.all([
                    source.doctors.availability(doctor.id),
                    service
                        ? source.slots.list({
                              doctorId: doctor.id,
                              serviceId: service.id,
                              date,
                          })
                        : Promise.resolve([] as Slot[]),
                ]);

                return {
                    doctor,
                    service,
                    slots,
                    availability,
                    offToday:
                        settings.holidays.some((h) => h.date === date) ||
                        availability.timeOff.some(
                            (t) => t.startDate <= date && date <= t.endDate,
                        ),
                };
            }),
        );
    }

    return {
        clinic,
        settings,
        today,
        doctors,
        rows,
        columns,
        nowIso: clockNow().toISOString(),
    };
}

/** Opening hours for a weekday, if the clinic is open. */
export function hoursFor(settings: ClinicSettings, weekday: number) {
    return settings.businessHours.find((h) => h.weekday === weekday) ?? null;
}

/** The half-hour rows for the day view: opening hours stretched to cover every doctor and event. */
export function dayRowTimes(data: CalendarData, date: IsoDate): string[] {
    const weekday = weekdayOf(date);
    const hours = hoursFor(data.settings, weekday);
    const starts: number[] = hours ? [toMinutes(hours.open)] : [];
    const ends: number[] = hours ? [toMinutes(hours.close)] : [];

    for (const column of data.columns) {
        for (const w of column.availability.windows.filter(
            (w) => w.weekday === weekday,
        )) {
            starts.push(toMinutes(w.start));
            ends.push(toMinutes(w.end));
        }
    }

    for (const { appointment } of data.rows) {
        const local = utcToZoned(
            new Date(appointment.startsAt),
            data.clinic.timezone,
        );
        starts.push(Math.floor(toMinutes(local.time) / STEP_MIN) * STEP_MIN);
        ends.push(Math.ceil((toMinutes(local.time) + 1) / STEP_MIN) * STEP_MIN);
    }

    if (starts.length === 0) {
        return [];
    }

    const from = Math.floor(Math.min(...starts) / STEP_MIN) * STEP_MIN;
    const to = Math.ceil(Math.max(...ends) / STEP_MIN) * STEP_MIN;
    const times: string[] = [];

    for (let m = from; m < to; m += STEP_MIN) {
        times.push(fromMinutes(m));
    }

    return times;
}

export type CellState =
    | { kind: 'events'; rows: Row[] }
    | { kind: 'free'; slot: Slot }
    | { kind: 'held' }
    | { kind: 'past' }
    | { kind: 'off'; reason: 'closed' | 'timeOff' }
    | { kind: 'busy' };

/** What one doctor/half-hour cell of the day view shows. */
export function cellState(
    column: ColumnData,
    time: string,
    date: IsoDate,
    data: CalendarData,
    rows: Row[],
): CellState {
    const tz = data.clinic.timezone;
    const start = toMinutes(time);
    const end = start + STEP_MIN;
    const minuteOf = (iso: string) =>
        toMinutes(utcToZoned(new Date(iso), tz).time);

    const here = rows.filter(
        ({ appointment }) =>
            appointment.doctorId === column.doctor.id &&
            minuteOf(appointment.startsAt) >= start &&
            minuteOf(appointment.startsAt) < end,
    );

    if (here.length > 0) {
        return { kind: 'events', rows: here };
    }

    const inRow = column.slots.filter(
        (s) => minuteOf(s.startsAt) >= start && minuteOf(s.startsAt) < end,
    );
    const free = inRow.find((s) => s.state === 'free' || s.heldByMe);

    if (free) {
        return { kind: 'free', slot: free };
    }

    if (inRow.length > 0) {
        return { kind: 'held' };
    }

    if (zonedToUtc(date, fromMinutes(end), tz).getTime() <= clockMs()) {
        return { kind: 'past' };
    }

    const weekday = weekdayOf(date);
    const working = column.availability.windows.some(
        (w) =>
            w.weekday === weekday &&
            toMinutes(w.start) <= start &&
            end <= toMinutes(w.end) &&
            !w.breaks.some(
                (b) => toMinutes(b.start) < end && start < toMinutes(b.end),
            ),
    );

    if (!working || column.offToday) {
        return {
            kind: 'off',
            reason: column.offToday ? 'timeOff' : 'closed',
        };
    }

    return { kind: 'busy' };
}

export const APPOINTMENT_STATUSES = [
    'booked',
    'confirmed',
    'arrived',
    'in_consultation',
    'done',
    'cancelled',
    'no_show',
] as const;

/** The week's days (Monday first) on which the clinic is open. */
export function openDaysOfWeek(
    settings: ClinicSettings,
    date: IsoDate,
): IsoDate[] {
    const monday = weekStart(date);

    return Array.from({ length: 7 }, (_, i) => addDaysToDate(monday, i)).filter(
        (d) => hoursFor(settings, weekdayOf(d)),
    );
}
