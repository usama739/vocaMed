import { Head, Link } from '@inertiajs/react';
import { Clock, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { nextFreeLabel } from '@/components/admin/doctors/next-free';
import { StatusPill } from '@/components/admin/status-pill';
import {
    PageBody,
    PageError,
    PageHeader,
    PatientAvatar,
    SampleNote,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { EmptyState } from '@/components/vocamed/states';
import { notify } from '@/components/vocamed/toast';
import { useChangedKeys } from '@/hooks/use-changed-keys';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useUrlParams } from '@/hooks/use-url-params';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { AdminDoctorRow, AdminDoctorsParams } from '@/lib/data';
import { cn } from '@/lib/utils';

const COLUMNS =
    'grid grid-cols-[minmax(220px,2fr)_minmax(150px,1.4fr)_140px_minmax(170px,1.4fr)_210px] gap-4';

const STATUSES: AdminDoctorsParams['status'][] = ['all', 'active', 'inactive'];

export default function Doctors() {
    const { t, locale } = useT();
    const source = useData();
    const { message } = useErrorText();
    const searchId = useId();
    const statusId = useId();
    const [params, setParams] = useUrlParams({ q: '', status: 'all' });
    const [debounced, setDebounced] = useState(params.q.trim());
    const status = (STATUSES as string[]).includes(params.status)
        ? (params.status as AdminDoctorsParams['status'])
        : 'all';
    const [confirming, setConfirming] = useState<AdminDoctorRow | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(
            () => setDebounced(params.q.trim()),
            250,
        );

        return () => window.clearTimeout(timer);
    }, [params.q]);

    const query = useView(
        'adminDoctors',
        { q: debounced, status },
        {
            keepPrevious: true,
            refreshMs: 10_000,
            emptyFrom: (view) => ({ ...view, total: 0, rows: [] }),
        },
    );
    const data = query.data;
    const tz = data?.clinic.timezone ?? 'UTC';
    const changed = useChangedKeys(
        data?.rows,
        (row) => row.doctor.id,
        (row) => String(row.doctor.active),
    );

    const setActive = async (row: AdminDoctorRow, active: boolean) => {
        setPending(row.doctor.id);

        try {
            await source.doctors.setActive(row.doctor.id, active);
            notify(
                'success',
                t(
                    active
                        ? 'admin.doctors.reactivated'
                        : 'admin.doctors.deactivated',
                    { name: row.doctor.name },
                ),
            );
            query.reload();
        } catch (caught) {
            notify('error', message(caught));
        } finally {
            setPending(null);
        }
    };

    const loading = query.status === 'loading';
    const empty = query.status === 'ready' && data?.total === 0;
    const showTable = query.status === 'ready' && !!data && data.total > 0;
    const upcoming = confirming?.upcoming ?? 0;

    return (
        <>
            <Head title={t('admin.doctors.title')} />
            <PageBody>
                <PageHeader
                    title={t('admin.doctors.title')}
                    lead={t('admin.doctors.sub')}
                    actions={
                        <Button asChild>
                            <Link href="/admin/doctors/new">
                                <Plus aria-hidden="true" />
                                {t('admin.doctors.add')}
                            </Link>
                        </Button>
                    }
                />

                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {(showTable || loading) && (
                    <>
                        <div className="flex flex-wrap gap-3">
                            <div className="relative min-w-[280px] flex-[1_1_280px]">
                                <label htmlFor={searchId} className="sr-only">
                                    {t('admin.doctors.searchLabel')}
                                </label>
                                <Search
                                    aria-hidden="true"
                                    className="pointer-events-none absolute start-3.5 top-[15px] size-[18px] text-subtle"
                                />
                                <input
                                    id={searchId}
                                    type="search"
                                    value={params.q}
                                    placeholder={t('admin.doctors.searchPh')}
                                    onChange={(event) =>
                                        setParams({ q: event.target.value })
                                    }
                                    className="h-12 w-full rounded-md border border-line-strong bg-white ps-11 pe-3.5 text-control text-ink placeholder:text-subtle"
                                />
                            </div>
                            <div className="flex-[0_0_200px]">
                                <label htmlFor={statusId} className="sr-only">
                                    {t('admin.doctors.statusLabel')}
                                </label>
                                <select
                                    id={statusId}
                                    value={status}
                                    onChange={(event) =>
                                        setParams({
                                            status: event.target.value,
                                        })
                                    }
                                    className="h-12 w-full rounded-md border border-line-strong bg-white px-3.5 text-control text-ink"
                                >
                                    <option value="all">
                                        {t('admin.doctors.fAll')}
                                    </option>
                                    <option value="active">
                                        {t('admin.doctors.fActive')}
                                    </option>
                                    <option value="inactive">
                                        {t('admin.doctors.fInactive')}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-line shadow-soft">
                            <div
                                role="table"
                                aria-label={t('admin.doctors.table')}
                                aria-busy={loading || undefined}
                                className="min-w-[880px]"
                            >
                                <div
                                    role="row"
                                    className={cn(
                                        COLUMNS,
                                        'border-b border-line bg-surface-subtle px-5 py-3 text-small font-semibold text-subtle',
                                    )}
                                >
                                    <span role="columnheader">
                                        {t('admin.doctors.colName')}
                                    </span>
                                    <span role="columnheader">
                                        {t('admin.doctors.colSpec')}
                                    </span>
                                    <span role="columnheader">
                                        {t('admin.doctors.colStatus')}
                                    </span>
                                    <span role="columnheader">
                                        {t('admin.doctors.colNext')}
                                    </span>
                                    <span role="columnheader">
                                        {t('admin.doctors.colActions')}
                                    </span>
                                </div>

                                {loading &&
                                    [0, 1, 2].map((index) => (
                                        <div
                                            key={index}
                                            aria-hidden="true"
                                            className={cn(
                                                COLUMNS,
                                                'h-[72px] animate-pulse items-center border-b border-line-soft px-5 last:border-b-0 motion-reduce:animate-none',
                                            )}
                                        >
                                            <span className="h-3.5 rounded-md bg-[#e8ecf4]" />
                                            <span className="h-3.5 rounded-md bg-[#e8ecf4]" />
                                            <span className="h-6 rounded-full bg-[#e8ecf4]" />
                                            <span className="h-3.5 rounded-md bg-[#e8ecf4]" />
                                            <span className="h-3.5 rounded-md bg-[#e8ecf4]" />
                                        </div>
                                    ))}

                                {showTable &&
                                    data?.rows.map((row) => {
                                        const { doctor } = row;

                                        return (
                                            <div
                                                key={doctor.id}
                                                role="row"
                                                data-doctor={doctor.id}
                                                className={cn(
                                                    COLUMNS,
                                                    'min-h-[72px] items-center border-b border-line-soft px-5 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-surface-row',
                                                    changed.has(doctor.id) &&
                                                        'animate-flash',
                                                )}
                                            >
                                                <div
                                                    role="cell"
                                                    className="flex min-w-0 items-center gap-3"
                                                >
                                                    <PatientAvatar
                                                        name={doctor.name}
                                                    />
                                                    <Link
                                                        href={`/admin/doctors/${doctor.id}`}
                                                        className="inline-flex min-h-11 items-center text-control font-semibold text-ink"
                                                    >
                                                        {doctor.name}
                                                    </Link>
                                                </div>
                                                <span
                                                    role="cell"
                                                    className="text-control"
                                                >
                                                    {doctor.specialty ||
                                                        t(
                                                            'admin.doctors.noSpecialty',
                                                        )}
                                                </span>
                                                <div role="cell">
                                                    <StatusPill
                                                        tone={
                                                            doctor.active
                                                                ? 'active'
                                                                : 'inactive'
                                                        }
                                                    >
                                                        {doctor.active
                                                            ? t(
                                                                  'admin.common.active',
                                                              )
                                                            : t(
                                                                  'admin.common.inactive',
                                                              )}
                                                    </StatusPill>
                                                </div>
                                                <span
                                                    role="cell"
                                                    className="flex items-center gap-2 text-control text-ink"
                                                >
                                                    <Clock
                                                        aria-hidden="true"
                                                        className="size-4 shrink-0 text-subtle"
                                                    />
                                                    <span dir="ltr">
                                                        {nextFreeLabel(
                                                            row.nextFree,
                                                            data.today,
                                                            tz,
                                                            locale,
                                                            t,
                                                        )}
                                                    </span>
                                                </span>
                                                <div
                                                    role="cell"
                                                    className="flex items-center gap-2"
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        asChild
                                                    >
                                                        <Link
                                                            href={`/admin/doctors/${doctor.id}`}
                                                            aria-label={t(
                                                                'admin.doctors.openAria',
                                                                {
                                                                    name: doctor.name,
                                                                },
                                                            )}
                                                        >
                                                            {t(
                                                                'admin.doctors.open',
                                                            )}
                                                        </Link>
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={
                                                            pending ===
                                                            doctor.id
                                                        }
                                                        aria-label={t(
                                                            doctor.active
                                                                ? 'admin.doctors.deactivateAria'
                                                                : 'admin.doctors.reactivateAria',
                                                            {
                                                                name: doctor.name,
                                                            },
                                                        )}
                                                        className={
                                                            doctor.active
                                                                ? 'text-danger-ink'
                                                                : 'text-brand-hover'
                                                        }
                                                        onClick={() =>
                                                            doctor.active
                                                                ? setConfirming(
                                                                      row,
                                                                  )
                                                                : setActive(
                                                                      row,
                                                                      true,
                                                                  )
                                                        }
                                                    >
                                                        {pending ===
                                                            doctor.id && (
                                                            <Loader2
                                                                aria-hidden="true"
                                                                className="animate-spin motion-reduce:animate-none"
                                                            />
                                                        )}
                                                        {doctor.active
                                                            ? t(
                                                                  'admin.doctors.deactivate',
                                                              )
                                                            : t(
                                                                  'admin.doctors.reactivate',
                                                              )}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                {showTable && data?.rows.length === 0 && (
                                    <div
                                        role="status"
                                        className="px-5 py-10 text-center text-control"
                                    >
                                        {t('admin.doctors.noMatches')}
                                    </div>
                                )}
                            </div>
                        </div>

                        {showTable && data && (
                            <p className="text-label text-subtle">
                                {t('admin.doctors.count', {
                                    shown: data.rows.length,
                                    total: data.total,
                                })}
                            </p>
                        )}
                    </>
                )}

                {loading && (
                    <p role="status" className="sr-only">
                        {t('admin.doctors.loading')}
                    </p>
                )}

                {empty && (
                    <div className="rounded-xl border border-dashed border-[#aeb6c8]">
                        <EmptyState
                            icon={UserPlus}
                            title={t('admin.doctors.emptyTitle')}
                            description={t('admin.doctors.emptyBody')}
                            action={
                                <Button asChild>
                                    <Link href="/admin/doctors/new">
                                        {t('admin.doctors.add')}
                                    </Link>
                                </Button>
                            }
                        />
                    </div>
                )}

                <SampleNote />
            </PageBody>

            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title={t('admin.doctors.confirmTitle', {
                    name: confirming?.doctor.name ?? '',
                })}
                description={
                    upcoming > 0
                        ? t('admin.doctors.confirmBody', { count: upcoming })
                        : t('admin.doctors.confirmNone')
                }
                confirmLabel={t('admin.doctors.deactivate')}
                cancelLabel={t('admin.common.cancel')}
                onConfirm={async () => {
                    if (confirming) {
                        await setActive(confirming, false);
                    }
                }}
            />
        </>
    );
}
