import { Link } from '@inertiajs/react';
import { CalendarOff, CalendarPlus, Clock } from 'lucide-react';
import { initialsOf, localDate } from '@/components/reception/format';
import { StatusToggleGroup } from '@/components/reception/status-toggle-group';
import { Button } from '@/components/ui/button';
import { formatClock, formatWhen } from '@/components/vocamed/booking/format';
import { StatusBadge } from '@/components/vocamed/status-badge';
import { useT } from '@/i18n/scope';
import type {
    AppointmentRow,
    AppointmentStatus,
    DoctorDay,
    IsoDate,
} from '@/lib/data';
import { cn } from '@/lib/utils';

/** The row grid: stacked on tablets, one line of four columns from `lg` up. */
const ROW =
    'grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 px-5 py-2.5 lg:min-h-[72px] lg:grid-cols-[80px_minmax(200px,1.6fr)_170px_minmax(300px,2.4fr)]';

function ScheduleRow({
    row,
    timeZone,
    changed,
    pendingStage,
    onToggle,
}: {
    row: AppointmentRow;
    timeZone: string;
    changed: boolean;
    pendingStage: AppointmentStatus | null;
    onToggle: (row: AppointmentRow, stage: AppointmentStatus) => void;
}) {
    const { t } = useT();
    const { appointment, patient, service } = row;
    const clock = formatClock(appointment.startsAt, timeZone);
    const walkIn = appointment.source === 'walk_in';

    return (
        <li
            data-appointment={appointment.id}
            data-status={appointment.status}
            aria-label={t('reception.today.row', { time: clock })}
            className={cn(
                ROW,
                'border-b border-line-soft transition-colors duration-150 last:border-b-0 hover:bg-surface-row',
                changed && 'animate-flash',
                appointment.status === 'cancelled' && 'opacity-70',
            )}
        >
            <span dir="ltr" className="text-start text-body font-bold text-ink">
                {clock}
            </span>
            <Link
                href={`/reception/appointments/${appointment.id}`}
                className="flex min-h-11 min-w-0 flex-col justify-center leading-[1.4] hover:text-brand-hover"
            >
                <span className="truncate text-control font-semibold text-ink">
                    {patient.name}
                </span>
                <span className="truncate text-label">
                    {service.name}
                    {walkIn && ` · ${t('reception.source.walk_in')}`}
                </span>
            </Link>
            <div className="col-span-2 lg:col-span-1">
                <StatusBadge status={appointment.status} />
            </div>
            <div className="col-span-2 lg:col-span-1">
                <StatusToggleGroup
                    patientName={patient.name}
                    status={appointment.status}
                    allowed={row.allowed}
                    pending={pendingStage}
                    onToggle={(stage) => onToggle(row, stage)}
                />
            </div>
        </li>
    );
}

/** One doctor's day: who they are, their next free time, and a row per appointment. */
export function DoctorSchedule({
    day,
    today,
    timeZone,
    changed,
    pending,
    onToggle,
    onBook,
    index = 0,
}: {
    day: DoctorDay;
    today: IsoDate;
    timeZone: string;
    changed: ReadonlySet<string>;
    pending: { id: string; stage: AppointmentStatus } | null;
    onToggle: (row: AppointmentRow, stage: AppointmentStatus) => void;
    onBook: (doctorId: string) => void;
    index?: number;
}) {
    const { t, locale } = useT();
    const { doctor, rows, nextFree, notWorking } = day;

    const nextLabel = nextFree
        ? localDate(nextFree.startsAt, timeZone) === today
            ? formatClock(nextFree.startsAt, timeZone)
            : formatWhen(nextFree.startsAt, timeZone, locale)
        : null;

    return (
        <section
            aria-label={doctor.name}
            style={{ animationDelay: `${index * 60}ms` }}
            className="animate-rise overflow-hidden rounded-xl border border-line bg-white motion-reduce:animate-none"
        >
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface-subtle px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="inline-flex size-10 items-center justify-center rounded-full bg-brand-tint text-label font-bold text-brand-deep"
                    >
                        {initialsOf(doctor.name)}
                    </span>
                    <div className="flex flex-col leading-[1.4]">
                        <strong className="text-body text-ink">
                            {doctor.name}
                        </strong>
                        <span className="text-label">{doctor.specialty}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    {notWorking && (
                        <span className="inline-flex items-center gap-2 text-label font-semibold text-subtle">
                            <CalendarOff
                                aria-hidden="true"
                                className="size-4"
                            />
                            {t('reception.today.notWorking')}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-2 text-label font-semibold text-success-ink">
                        <Clock aria-hidden="true" className="size-4" />
                        {nextLabel ? (
                            <>
                                {t('reception.today.nextFree')}{' '}
                                <span dir="ltr">{nextLabel}</span>
                            </>
                        ) : (
                            t('reception.today.noneFree')
                        )}
                    </span>
                </div>
            </div>

            {rows.length > 0 ? (
                <ul>
                    {rows.map((row) => (
                        <ScheduleRow
                            key={row.appointment.id}
                            row={row}
                            timeZone={timeZone}
                            changed={changed.has(row.appointment.id)}
                            pendingStage={
                                pending?.id === row.appointment.id
                                    ? pending.stage
                                    : null
                            }
                            onToggle={onToggle}
                        />
                    ))}
                </ul>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex flex-col">
                        <strong className="text-control text-ink">
                            {t('reception.today.noAppointments')}
                        </strong>
                        <span className="text-label">
                            {t('reception.today.noAppointmentsBody')}
                        </span>
                    </div>
                    <Button variant="outline" onClick={() => onBook(doctor.id)}>
                        <CalendarPlus aria-hidden="true" />
                        {t('reception.today.book')}
                    </Button>
                </div>
            )}
        </section>
    );
}
