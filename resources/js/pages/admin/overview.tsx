import { Head, Link } from '@inertiajs/react';
import {
    CalendarDays,
    CircleCheck,
    CircleCheckBig,
    CircleMinus,
    CircleX,
    Clock,
    MessageSquare,
    TriangleAlert,
    UserPlus,
} from 'lucide-react';
import { useMemo } from 'react';
import {
    InsightCard,
    OutcomeBar,
    ShareBar,
    SourceBar,
    WeekdayBars,
} from '@/components/admin/overview/breakdowns';
import { KpiCard } from '@/components/admin/overview/kpi-card';
import { kpiDelta, type KpiDelta } from '@/components/admin/overview/model';
import { TrendChart } from '@/components/admin/overview/trend-chart';
import { localDate } from '@/components/reception/format';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { formatClock, formatWhen } from '@/components/vocamed/booking/format';
import { EmptyState } from '@/components/vocamed/states';
import { useUrlParams } from '@/hooks/use-url-params';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type {
    AdminOverviewView,
    AdminPeriod,
    KpiValue,
    Slot,
} from '@/lib/data';
import { cn } from '@/lib/utils';

const PERIODS: AdminPeriod[] = ['last7', 'month', 'last3months'];

const isPeriod = (value: string): value is AdminPeriod =>
    (PERIODS as string[]).includes(value);

type KpiSpec = {
    key: keyof AdminOverviewView['kpis'];
    icon: typeof CalendarDays;
    /** A rate moves in points and is shown with a percent sign. */
    rate: boolean;
    lowerIsBetter?: boolean;
};

const KPIS: KpiSpec[] = [
    { key: 'booked', icon: CalendarDays, rate: false },
    { key: 'done', icon: CircleCheck, rate: false },
    { key: 'cancellationRate', icon: CircleX, rate: true, lowerIsBetter: true },
    { key: 'noShowRate', icon: CircleMinus, rate: true, lowerIsBetter: true },
    { key: 'newPatients', icon: UserPlus, rate: false },
    { key: 'reminderDelivery', icon: MessageSquare, rate: true },
    { key: 'confirmed', icon: CircleCheckBig, rate: true },
    { key: 'doctorTimeUsed', icon: Clock, rate: true },
];

/** What `?state=empty` shows: a clinic with no appointments yet. */
const noActivity = (view: AdminOverviewView): AdminOverviewView => {
    const zero = (): KpiValue => ({ value: 0, previous: 0 });

    return {
        ...view,
        kpis: {
            booked: zero(),
            done: zero(),
            cancellationRate: zero(),
            noShowRate: zero(),
            newPatients: zero(),
            reminderDelivery: zero(),
            confirmed: zero(),
            doctorTimeUsed: zero(),
        },
        todayDoctors: [],
        alerts: { failedMessages: 0, doctorsWithoutHours: [] },
    };
};

const HEADER_CELL = 'text-small font-semibold text-subtle';
const TODAY_ROW =
    'grid grid-cols-[minmax(200px,2fr)_repeat(4,110px)_minmax(150px,1.3fr)] items-center gap-3 px-5';

export default function AdminOverview() {
    const { t, locale } = useT();
    const [params, setParams] = useUrlParams({ period: 'month' });
    const period: AdminPeriod = isPeriod(params.period)
        ? params.period
        : 'month';
    const query = useView(
        'adminOverview',
        { period },
        {
            keepPrevious: true,
            refreshMs: 15_000,
            emptyFrom: noActivity,
        },
    );
    const data = query.data;
    // The numbers dim while a new period loads, and are never blank.
    const switching = data !== undefined && data.period.id !== period;

    const nextLabel = (slot: Slot | null, tz: string, today: string) =>
        !slot
            ? t('admin.overview.today.none')
            : localDate(slot.startsAt, tz) === today
              ? `${t('reception.day.today')}, ${formatClock(slot.startsAt, tz)}`
              : formatWhen(slot.startsAt, tz, locale);

    const versus = useMemo(() => {
        if (!data) {
            return '';
        }

        if (data.period.id !== 'month') {
            return t(`admin.overview.vs.${data.period.id}`);
        }

        const month = new Intl.DateTimeFormat(
            locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB',
            { timeZone: 'UTC', month: 'long' },
        ).format(new Date(`${data.period.previousFrom}T12:00:00Z`));

        return t('admin.overview.vs.month', {
            from: Number(data.period.previousFrom.slice(8, 10)),
            to: Number(data.period.previousTo.slice(8, 10)),
            month,
        });
    }, [data, locale, t]);

    const delta = (value: KpiValue, spec: KpiSpec): KpiDelta | null =>
        kpiDelta(value.value, value.previous, {
            points: spec.rate,
            lowerIsBetter: spec.lowerIsBetter,
        });

    const tz = data?.clinic.timezone ?? 'UTC';
    const alerts = data?.alerts;
    const noHours = alerts?.doctorsWithoutHours ?? [];

    return (
        <>
            <Head title={t('admin.overview.title')} />
            <PageBody className="gap-7">
                <PageHeader
                    title={t('admin.overview.title')}
                    lead={t('admin.overview.sub')}
                    actions={
                        <div
                            role="group"
                            aria-label={t('admin.overview.period')}
                            className="inline-flex rounded-lg border border-line bg-surface-subtle p-1"
                        >
                            {PERIODS.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-pressed={period === id}
                                    onClick={() => setParams({ period: id })}
                                    className={cn(
                                        'min-h-11 rounded-[9px] px-4 text-[14.5px] font-semibold transition-colors',
                                        period === id
                                            ? 'bg-white text-ink shadow-xs'
                                            : 'text-copy hover:text-ink',
                                    )}
                                >
                                    {t(`admin.overview.periodName.${id}`)}
                                </button>
                            ))}
                        </div>
                    }
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.overview.loading')}
                        blocks={[72, 330, 360, 260]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && (
                    <div
                        aria-busy={switching}
                        className={cn(
                            'flex flex-col gap-7 transition-opacity duration-200',
                            switching && 'opacity-60',
                        )}
                    >
                        {((alerts?.failedMessages ?? 0) > 0 ||
                            noHours.length > 0) && (
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-4">
                                {(alerts?.failedMessages ?? 0) > 0 && (
                                    <div
                                        role="alert"
                                        className="flex animate-rise flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-[#fdf0f4] px-[18px] py-4 motion-reduce:animate-none"
                                    >
                                        <span className="flex items-start gap-2.5 text-control font-semibold text-[#7d0e2e]">
                                            <TriangleAlert
                                                aria-hidden="true"
                                                className="mt-0.5 size-5 shrink-0"
                                            />
                                            {t('admin.overview.alertFailed', {
                                                count: alerts?.failedMessages,
                                            })}
                                        </span>
                                        <Link
                                            href="/reception/notifications?status=failed"
                                            className="inline-flex min-h-11 items-center rounded-md border border-danger bg-white px-4 text-label font-semibold text-[#7d0e2e] hover:bg-surface-hover"
                                        >
                                            {t('admin.overview.reviewFailed')}
                                        </Link>
                                    </div>
                                )}
                                {noHours.length > 0 && (
                                    <div
                                        role="alert"
                                        className="flex animate-rise flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e3b341] bg-[#fff8e8] px-[18px] py-4 motion-reduce:animate-none"
                                    >
                                        <span className="flex items-start gap-2.5 text-control font-semibold text-[#5c3900]">
                                            <Clock
                                                aria-hidden="true"
                                                className="mt-0.5 size-5 shrink-0"
                                            />
                                            {t('admin.overview.alertNoHours', {
                                                count: noHours.length,
                                                name: noHours[0].name,
                                            })}
                                        </span>
                                        <Link
                                            href={
                                                noHours.length === 1
                                                    ? `/admin/doctors/${noHours[0].id}`
                                                    : '/admin/doctors'
                                            }
                                            className="inline-flex min-h-11 items-center rounded-md border border-[#b86e00] bg-white px-4 text-label font-semibold text-[#5c3900] hover:bg-surface-hover"
                                        >
                                            {t(
                                                noHours.length === 1
                                                    ? 'admin.overview.setHours'
                                                    : 'admin.overview.seeDoctors',
                                            )}
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}

                        <section
                            aria-labelledby="kpis-title"
                            className="flex flex-col gap-3.5"
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2
                                    id="kpis-title"
                                    className="text-lead font-semibold text-ink"
                                >
                                    {t(
                                        `admin.overview.periodName.${data.period.id}`,
                                    )}
                                </h2>
                                <span className="text-label text-subtle">
                                    {versus}
                                </span>
                            </div>
                            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
                                {KPIS.map((spec, index) => (
                                    <KpiCard
                                        key={spec.key}
                                        index={index}
                                        icon={spec.icon}
                                        label={t(
                                            `admin.overview.kpi.${spec.key}`,
                                        )}
                                        value={data.kpis[spec.key].value}
                                        previous={data.kpis[spec.key].previous}
                                        suffix={spec.rate ? '%' : ''}
                                        delta={delta(data.kpis[spec.key], spec)}
                                    />
                                ))}
                            </div>
                        </section>

                        {data.kpis.booked.value === 0 ? (
                            <section className="rounded-xl border border-line bg-white shadow-soft">
                                <EmptyState
                                    icon={CalendarDays}
                                    title={t('admin.overview.empty.title')}
                                    description={t('admin.overview.empty.body')}
                                />
                            </section>
                        ) : (
                            <>
                                <TrendChart
                                    points={data.trend.points}
                                    granularity={data.trend.granularity}
                                    period={data.period.id}
                                />

                                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5">
                                    <InsightCard
                                        id="weekdays-title"
                                        title={t(
                                            'admin.overview.weekdays.title',
                                        )}
                                        sub={t('admin.overview.weekdays.sub')}
                                        delay={160}
                                    >
                                        <WeekdayBars counts={data.weekdays} />
                                    </InsightCard>

                                    <InsightCard
                                        id="outcomes-title"
                                        title={t(
                                            'admin.overview.outcomes.title',
                                        )}
                                        sub={t('admin.overview.outcomes.sub')}
                                        delay={200}
                                    >
                                        <OutcomeBar outcomes={data.outcomes} />
                                        <SourceBar
                                            voice={data.sources.voice}
                                            manual={data.sources.manual}
                                        />
                                    </InsightCard>

                                    <InsightCard
                                        id="use-title"
                                        title={t('admin.overview.use.title')}
                                        sub={t('admin.overview.use.sub')}
                                        delay={240}
                                    >
                                        {data.doctorUse.map((doctor) => (
                                            <ShareBar
                                                key={doctor.doctorId}
                                                name={doctor.name}
                                                share={doctor.utilisation}
                                                booked={doctor.booked}
                                            />
                                        ))}
                                    </InsightCard>

                                    <InsightCard
                                        id="services-title"
                                        title={t(
                                            'admin.overview.services.title',
                                        )}
                                        sub={t('admin.overview.services.sub')}
                                        delay={280}
                                    >
                                        {data.services.map((service, index) => (
                                            <ShareBar
                                                key={service.serviceId}
                                                name={service.name}
                                                share={service.share}
                                                booked={service.booked}
                                                strong={index === 0}
                                            />
                                        ))}
                                    </InsightCard>
                                </div>
                            </>
                        )}

                        <section
                            aria-labelledby="today-title"
                            className="flex flex-col gap-3.5"
                        >
                            <h2
                                id="today-title"
                                className="text-lead font-semibold text-ink"
                            >
                                {t('admin.overview.today.title')}
                            </h2>
                            <div className="overflow-x-auto rounded-xl border border-line shadow-soft">
                                <div
                                    role="table"
                                    aria-label={t('admin.overview.today.title')}
                                    className="min-w-[820px]"
                                >
                                    <div
                                        role="row"
                                        className={cn(
                                            TODAY_ROW,
                                            'border-b border-line bg-surface-subtle py-3',
                                        )}
                                    >
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.doctor')}
                                        </span>
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.booked')}
                                        </span>
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.arrived')}
                                        </span>
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.consult')}
                                        </span>
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.done')}
                                        </span>
                                        <span
                                            role="columnheader"
                                            className={HEADER_CELL}
                                        >
                                            {t('admin.overview.today.next')}
                                        </span>
                                    </div>
                                    {data.todayDoctors.length === 0 && (
                                        <p className="px-5 py-8 text-center text-control">
                                            {t('admin.overview.today.empty')}
                                        </p>
                                    )}
                                    {data.todayDoctors.map((row) => (
                                        <div
                                            role="row"
                                            key={row.doctor.id}
                                            className={cn(
                                                TODAY_ROW,
                                                'min-h-16 border-b border-line-soft py-2.5 last:border-b-0',
                                            )}
                                        >
                                            <span
                                                role="cell"
                                                className="text-control font-semibold text-ink"
                                            >
                                                {row.doctor.name}
                                            </span>
                                            <span
                                                role="cell"
                                                className="text-control text-ink"
                                            >
                                                {row.booked}
                                            </span>
                                            <span
                                                role="cell"
                                                className="text-control text-ink"
                                            >
                                                {row.arrived}
                                            </span>
                                            <span
                                                role="cell"
                                                className="text-control text-ink"
                                            >
                                                {row.inConsultation}
                                            </span>
                                            <span
                                                role="cell"
                                                className="text-control text-ink"
                                            >
                                                {row.done}
                                            </span>
                                            <span
                                                role="cell"
                                                className="text-control text-ink"
                                            >
                                                {nextLabel(
                                                    row.nextFree,
                                                    tz,
                                                    data.today,
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </PageBody>
        </>
    );
}
