import { Head } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { AppointmentPanel } from '@/components/doctor/appointment-panel';
import {
    APPOINTMENT_STATUSES,
    openDaysOfWeek,
    rangeOf,
    shiftDate,
} from '@/components/reception/calendar/model';
import { DayView, WeekView } from '@/components/reception/calendar/views';
import { formatLongDate } from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { BADGE_SPEC } from '@/components/vocamed/status-badge';
import { useUrlParams } from '@/hooks/use-url-params';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { AppointmentRow, IsoDate } from '@/lib/data';
import { cn } from '@/lib/utils';

const VIEWS = ['day', 'week'] as const;
type View = (typeof VIEWS)[number];

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function DoctorSchedule() {
    const { t, locale } = useT();
    const [params, setParams] = useUrlParams({ view: 'day', date: '' });
    const [selected, setSelected] = useState<AppointmentRow | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const view: View = (VIEWS as readonly string[]).includes(params.view)
        ? (params.view as View)
        : 'day';
    const query = useView(
        'doctorSchedule',
        {
            view,
            // Empty means today: the server decides what today is.
            date: validDate(params.date) ? params.date : null,
        },
        { emptyFrom: (d) => ({ ...d, rows: [] }) },
    );
    const data = query.data;
    const date: IsoDate | null = data?.date ?? null;

    const rangeLabel = (() => {
        if (!date) {
            return ' ';
        }

        if (view === 'day') {
            return formatLongDate(date, locale, true);
        }

        const open = data ? openDaysOfWeek(data.settings, date) : [];
        const { from, to } = rangeOf('week', date);
        const noon = (d: string) => new Date(`${d}T12:00:00Z`);

        return new Intl.DateTimeFormat(
            locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB',
            {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            },
        ).formatRange(noon(open[0] ?? from), noon(open.at(-1) ?? to));
    })();

    const open = (row: AppointmentRow) => {
        setSelected(row);
        setPanelOpen(true);
    };
    const nav = (direction: 1 | -1) =>
        date && setParams({ date: shiftDate(view, date, direction) });

    return (
        <>
            <Head title={t('doctor.schedule.title')} />
            <PageBody className="gap-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                        <h1 className="text-heading font-bold text-ink">
                            {t('doctor.schedule.title')}
                        </h1>
                        <p className="text-control">
                            {t('doctor.schedule.sub')}
                        </p>
                        <p
                            key={`${view}${date}`}
                            aria-live="polite"
                            className="animate-fade text-label text-subtle motion-reduce:animate-none"
                        >
                            {rangeLabel}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('doctor.schedule.previous')}
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
                                {t('doctor.schedule.goToday')}
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('doctor.schedule.next')}
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
                            aria-label={t('doctor.schedule.views')}
                            className="inline-flex rounded-md border border-line bg-surface-subtle p-[3px]"
                        >
                            {VIEWS.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    aria-pressed={view === v}
                                    onClick={() => setParams({ view: v })}
                                    className={cn(
                                        'min-h-11 min-w-[76px] rounded-sm px-3.5 text-[14.5px] font-semibold transition-colors duration-150',
                                        view === v
                                            ? 'bg-brand-tint text-brand-deep'
                                            : 'text-copy hover:bg-surface-hover',
                                    )}
                                >
                                    {t(`doctor.schedule.${v}`)}
                                </button>
                            ))}
                        </div>
                    </div>
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
                </ul>

                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}
                {query.status === 'loading' && (
                    <PageLoading label={t('doctor.loading')} blocks={[480]} />
                )}

                {query.status === 'ready' && data && date && (
                    <div
                        key={`${view}${date}`}
                        className="animate-fade motion-reduce:animate-none"
                    >
                        {view === 'day' ? (
                            <>
                                {data.rows.length === 0 && (
                                    <p className="mb-3 rounded-lg border border-line bg-surface-subtle px-4 py-3 text-control">
                                        {t('doctor.schedule.emptyDay')}
                                    </p>
                                )}
                                <DayView
                                    data={data}
                                    date={date}
                                    readOnly={{ onOpen: open }}
                                />
                            </>
                        ) : (
                            <WeekView
                                data={data}
                                date={date}
                                readOnly={{ onOpen: open }}
                            />
                        )}
                    </div>
                )}

                <p className="text-label text-subtle">
                    {t('doctor.schedule.readonly')} · {t('common.sample')}
                </p>
                <SampleNote className="sr-only" />
            </PageBody>

            {data && (
                <AppointmentPanel
                    row={selected}
                    clinic={data.clinic}
                    today={data.today}
                    open={panelOpen}
                    onOpenChange={setPanelOpen}
                />
            )}
        </>
    );
}
