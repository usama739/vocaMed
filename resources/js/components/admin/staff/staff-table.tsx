import { PatientAvatar } from '@/components/reception/page-parts';
import { StatusPill, type PillTone } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';
import type { StaffRow, StaffStatus } from '@/lib/data';

const GRID =
    'grid grid-cols-[minmax(240px,2.2fr)_minmax(130px,1fr)_150px_minmax(300px,2fr)] gap-4 px-5';

const TONE: Record<StaffStatus, PillTone> = {
    active: 'active',
    invited: 'invited',
    expired: 'expired',
    deactivated: 'inactive',
};

const STATUS_KEY = {
    active: 'admin.staff.statusActive',
    invited: 'admin.staff.statusInvited',
    expired: 'admin.staff.statusExpired',
    deactivated: 'admin.staff.statusOff',
} as const;

/** The people on the team and what can be done with each, as the server allows. */
export function StaffTable({
    rows,
    busyId,
    onResend,
    onRevoke,
    onDeactivate,
    onReactivate,
}: {
    rows: StaffRow[];
    /** A row whose action is in flight. */
    busyId: string | null;
    onResend: (row: StaffRow) => void;
    onRevoke: (row: StaffRow) => void;
    onDeactivate: (row: StaffRow) => void;
    onReactivate: (row: StaffRow) => void;
}) {
    const { t } = useT();
    const waiting = (row: StaffRow) =>
        row.status === 'invited' || row.status === 'expired';
    const nameOf = (row: StaffRow) =>
        waiting(row) || !row.name ? t('admin.staff.pending') : row.name;

    return (
        <div className="overflow-x-auto rounded-xl border border-line">
            <div
                role="table"
                aria-label={t('admin.staff.title')}
                className="min-w-[900px]"
            >
                <div
                    role="row"
                    className={`${GRID} border-b border-line bg-surface-subtle py-3 text-small font-semibold text-subtle`}
                >
                    <span role="columnheader">{t('admin.staff.colUser')}</span>
                    <span role="columnheader">{t('admin.staff.colRole')}</span>
                    <span role="columnheader">
                        {t('admin.staff.colStatus')}
                    </span>
                    <span role="columnheader">
                        {t('admin.staff.colActions')}
                    </span>
                </div>
                {rows.map((row, index) => (
                    <div
                        key={row.id}
                        role="row"
                        data-staff={row.id}
                        style={{ animationDelay: `${index * 40}ms` }}
                        className={`${GRID} min-h-[72px] animate-rise items-center border-b border-line-soft py-2.5 hover:bg-surface-row motion-reduce:animate-none`}
                    >
                        <div
                            role="cell"
                            className="flex min-w-0 items-center gap-3"
                        >
                            <PatientAvatar
                                name={waiting(row) ? '@' : (row.name ?? '@')}
                            />
                            <div className="flex min-w-0 flex-col leading-[1.4]">
                                <span className="text-control font-semibold text-ink">
                                    {nameOf(row)}
                                </span>
                                <span
                                    dir="ltr"
                                    className="truncate text-start text-[13.5px]"
                                >
                                    {row.email}
                                </span>
                            </div>
                        </div>
                        <span role="cell" className="text-control text-ink">
                            {row.role === 'clinic_admin'
                                ? t('admin.staff.roleAdmin')
                                : t('admin.staff.roleReceptionist')}
                        </span>
                        <div role="cell">
                            <StatusPill tone={TONE[row.status]}>
                                {t(STATUS_KEY[row.status])}
                            </StatusPill>
                        </div>
                        <div
                            role="cell"
                            className="flex flex-wrap items-center gap-2"
                        >
                            {row.isYou && (
                                <span className="text-label text-subtle">
                                    {t('admin.staff.you')}
                                </span>
                            )}
                            {row.allowed.resend && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busyId === row.id}
                                    aria-label={t('admin.staff.resendAria', {
                                        email: row.email,
                                    })}
                                    onClick={() => onResend(row)}
                                >
                                    {t('admin.staff.resend')}
                                </Button>
                            )}
                            {row.allowed.revoke && (
                                <Button
                                    variant="outline-destructive"
                                    size="sm"
                                    disabled={busyId === row.id}
                                    aria-label={t('admin.staff.revokeAria', {
                                        email: row.email,
                                    })}
                                    onClick={() => onRevoke(row)}
                                >
                                    {t('admin.staff.revoke')}
                                </Button>
                            )}
                            {row.allowed.deactivate && (
                                <Button
                                    variant="outline-destructive"
                                    size="sm"
                                    disabled={busyId === row.id}
                                    aria-label={t(
                                        'admin.staff.deactivateAria',
                                        {
                                            name: nameOf(row),
                                        },
                                    )}
                                    onClick={() => onDeactivate(row)}
                                >
                                    {t('admin.staff.deactivate')}
                                </Button>
                            )}
                            {row.allowed.reactivate && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-brand-hover"
                                    disabled={busyId === row.id}
                                    aria-label={t(
                                        'admin.staff.reactivateAria',
                                        {
                                            name: nameOf(row),
                                        },
                                    )}
                                    onClick={() => onReactivate(row)}
                                >
                                    {t('admin.staff.reactivate')}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
