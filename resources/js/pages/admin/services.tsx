import { Head } from '@inertiajs/react';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { ServiceDialog } from '@/components/admin/services/service-dialog';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/vocamed/states';
import { notify } from '@/components/vocamed/toast';
import { ToggleSwitch } from '@/components/vocamed/toggle-switch';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { ServiceInput, ServiceRow } from '@/lib/data';

const GRID =
    'grid grid-cols-[minmax(200px,2fr)_110px_110px_minmax(150px,1.2fr)_150px_110px] gap-4 px-5';

/** `null` is the dialog closed, `'new'` an empty form, a row the one being edited. */
type Editing = ServiceRow | 'new' | null;

export default function Services() {
    const { t } = useT();
    const source = useData();
    const errors = useErrorText();
    const query = useView('adminServices', undefined, {
        refreshMs: 10_000,
        emptyFrom: (d) => ({ ...d, services: [] }),
    });
    const [editing, setEditing] = useState<Editing>(null);
    // What a switch shows while its save is in flight; dropped once the server has answered.
    const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

    const data = query.data;

    const save = async (input: ServiceInput) => {
        if (editing === null) {
            return;
        }

        if (editing === 'new') {
            await source.services.create(input);
        } else {
            await source.services.update(editing.service.id, input);
        }

        setEditing(null);
        notify('success', t('admin.services.okSaved'));
        query.reload();
    };

    const toggle = async (row: ServiceRow, active: boolean) => {
        const { id, name } = row.service;
        setOptimistic((o) => ({ ...o, [id]: active }));

        try {
            await source.services.setActive(id, active);
            notify(
                'success',
                t(active ? 'admin.services.okOn' : 'admin.services.okOff', {
                    name,
                }),
            );
            query.reload();
        } catch (caught) {
            notify('error', errors.message(caught));
        } finally {
            setOptimistic(({ [id]: _done, ...rest }) => {
                void _done;

                return rest;
            });
        }
    };

    return (
        <>
            <Head title={t('admin.services.title')} />
            <PageBody>
                <PageHeader
                    title={t('admin.services.title')}
                    lead={t('admin.services.sub')}
                    actions={
                        <Button onClick={() => setEditing('new')}>
                            <Plus aria-hidden="true" />
                            {t('admin.services.add')}
                        </Button>
                    }
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.services.loading')}
                        blocks={[46, 72, 72, 72]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && (
                    <>
                        {data.services.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-line-strong">
                                <EmptyState
                                    icon={ClipboardList}
                                    title={t('admin.services.emptyTitle')}
                                    description={t('admin.services.emptyBody')}
                                    action={
                                        <Button
                                            onClick={() => setEditing('new')}
                                        >
                                            <Plus aria-hidden="true" />
                                            {t('admin.services.add')}
                                        </Button>
                                    }
                                />
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-line shadow-soft">
                                <div
                                    role="table"
                                    aria-label={t('admin.services.title')}
                                    className="min-w-[900px]"
                                >
                                    <div
                                        role="row"
                                        className={`${GRID} border-b border-line bg-surface-subtle py-3 text-small font-semibold text-subtle`}
                                    >
                                        {(
                                            [
                                                'colName',
                                                'colDur',
                                                'colBuf',
                                                'colDocs',
                                                'colActive',
                                                'colActions',
                                            ] as const
                                        ).map((key) => (
                                            <span key={key} role="columnheader">
                                                {t(`admin.services.${key}`)}
                                            </span>
                                        ))}
                                    </div>
                                    {data.services.map((row, index) => {
                                        const { service } = row;
                                        const active =
                                            optimistic[service.id] ??
                                            service.active;

                                        return (
                                            <div
                                                key={service.id}
                                                role="row"
                                                data-service={service.id}
                                                style={{
                                                    animationDelay: `${index * 40}ms`,
                                                }}
                                                className={`${GRID} min-h-[72px] animate-rise items-center border-b border-line-soft py-2.5 hover:bg-surface-row motion-reduce:animate-none`}
                                            >
                                                <span
                                                    role="cell"
                                                    className="text-control font-semibold text-ink"
                                                >
                                                    {service.name}
                                                </span>
                                                <span
                                                    role="cell"
                                                    className="text-control text-ink"
                                                >
                                                    {t('admin.common.min', {
                                                        count: service.durationMin,
                                                    })}
                                                </span>
                                                <span
                                                    role="cell"
                                                    className="text-control text-ink"
                                                >
                                                    {t('admin.common.min', {
                                                        count: service.bufferMin,
                                                    })}
                                                </span>
                                                <span
                                                    role="cell"
                                                    className="text-control"
                                                >
                                                    {row.doctorIds.length === 0
                                                        ? t(
                                                              'admin.services.noDocs',
                                                          )
                                                        : t(
                                                              'admin.services.docs',
                                                              {
                                                                  count: row
                                                                      .doctorIds
                                                                      .length,
                                                              },
                                                          )}
                                                </span>
                                                <div
                                                    role="cell"
                                                    className="flex items-center gap-2"
                                                >
                                                    <ToggleSwitch
                                                        checked={active}
                                                        label={service.name}
                                                        onChange={(on) =>
                                                            toggle(row, on)
                                                        }
                                                    />
                                                    <span className="text-[13.5px] font-semibold text-ink">
                                                        {t(
                                                            active
                                                                ? 'admin.common.on'
                                                                : 'admin.common.off',
                                                        )}
                                                    </span>
                                                </div>
                                                <div role="cell">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        aria-label={t(
                                                            'admin.services.editAria',
                                                            {
                                                                name: service.name,
                                                            },
                                                        )}
                                                        onClick={() =>
                                                            setEditing(row)
                                                        }
                                                    >
                                                        {t('admin.common.edit')}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <p className="text-label text-subtle">
                            {t('admin.services.note')}
                        </p>
                    </>
                )}
            </PageBody>

            <ServiceDialog
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
                row={editing === 'new' ? null : editing}
                doctors={data?.doctors ?? []}
                onSave={save}
            />
        </>
    );
}
