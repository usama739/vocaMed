import {
    CalendarPlus,
    CircleX,
    LogIn,
    Mail,
    Pencil,
    SlidersHorizontal,
    type LucideIcon,
} from 'lucide-react';
import {
    describeAudit,
    type Translate,
} from '@/components/admin/audit/describe';
import { localDate, relativeDay } from '@/components/reception/format';
import { formatClock } from '@/components/vocamed/booking/format';
import { useT } from '@/i18n/scope';
import type { AuditCategory, AuditRow } from '@/lib/data';

export const CATEGORIES: AuditCategory[] = [
    'booking',
    'edit',
    'cancel',
    'login',
    'settings',
    'invite',
];

const ICONS: Record<AuditCategory, LucideIcon> = {
    booking: CalendarPlus,
    edit: Pencil,
    cancel: CircleX,
    login: LogIn,
    settings: SlidersHorizontal,
    invite: Mail,
};

const GRID =
    'grid grid-cols-[170px_minmax(150px,1fr)_190px_minmax(300px,2.4fr)] gap-4 px-5';

/** The read-only log: when, who, what kind of action, and a sentence about it. */
export function AuditTable({
    rows,
    today,
    timezone,
    empty,
}: {
    rows: AuditRow[];
    today: string;
    timezone: string;
    /** What to show instead of rows when nothing matches. */
    empty: React.ReactNode;
}) {
    const { t, locale } = useT();

    return (
        <div className="overflow-x-auto rounded-xl border border-line shadow-soft">
            <div
                role="table"
                aria-label={t('admin.audit.title')}
                className="min-w-[900px]"
            >
                <div
                    role="row"
                    className={`${GRID} border-b border-line bg-surface-subtle py-3 text-[13px] font-semibold text-subtle`}
                >
                    <span role="columnheader">{t('admin.audit.colTime')}</span>
                    <span role="columnheader">{t('admin.audit.colUser')}</span>
                    <span role="columnheader">
                        {t('admin.audit.colAction')}
                    </span>
                    <span role="columnheader">
                        {t('admin.audit.colDetails')}
                    </span>
                </div>
                {rows.map((row) => {
                    const Icon = ICONS[row.category];
                    const relative = relativeDay(
                        localDate(row.at, timezone),
                        today,
                    );
                    const who =
                        row.actor.name ??
                        t(
                            row.actor.kind === 'patient'
                                ? 'admin.audit.actors.patient'
                                : 'admin.audit.actors.system',
                        );

                    return (
                        <div
                            key={row.id}
                            role="row"
                            data-audit={row.id}
                            className={`${GRID} min-h-[68px] items-center border-b border-line-soft py-2.5 last:border-b-0 hover:bg-[#fafbfc]`}
                        >
                            <div
                                role="cell"
                                className="flex flex-col leading-[1.4]"
                            >
                                <span className="text-[14.5px] font-semibold text-ink">
                                    {t(`reception.day.${relative.key}`, {
                                        count: relative.count,
                                    })}
                                </span>
                                <span
                                    dir="ltr"
                                    className="text-start text-[13.5px]"
                                >
                                    {formatClock(row.at, timezone)}
                                </span>
                            </div>
                            <span role="cell" className="text-body text-ink">
                                {who}
                            </span>
                            <div role="cell">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef1f6] px-3 py-[5px] text-[13.5px] font-semibold text-[#2f3a56]">
                                    <Icon
                                        aria-hidden="true"
                                        className="size-3.5"
                                        strokeWidth={2.2}
                                    />
                                    {t(
                                        `admin.audit.categories.${row.category}`,
                                    )}
                                </span>
                            </div>
                            <span
                                role="cell"
                                className="text-[14.5px] text-ink-soft"
                            >
                                {describeAudit(row, {
                                    t: t as unknown as Translate,
                                    tz: timezone,
                                    locale,
                                })}
                            </span>
                        </div>
                    );
                })}
                {rows.length === 0 && empty}
            </div>
        </div>
    );
}
