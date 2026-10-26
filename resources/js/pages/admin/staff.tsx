import { Head } from '@inertiajs/react';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { InviteDialog } from '@/components/admin/staff/invite-dialog';
import { StaffTable } from '@/components/admin/staff/staff-table';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/vocamed/confirm-dialog';
import { EmptyState } from '@/components/vocamed/states';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import type { StaffInviteInput, StaffRow } from '@/lib/data';

type Pending = { kind: 'revoke' | 'deactivate'; row: StaffRow } | null;

export default function Staff() {
    const { t } = useT();
    const source = useData();
    const errors = useErrorText();
    const query = useView('adminStaff', undefined, {
        refreshMs: 10_000,
        emptyFrom: (d) => ({ ...d, rows: [] }),
    });
    const [inviteOpen, setInviteOpen] = useState(false);
    const [pending, setPending] = useState<Pending>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const data = query.data;

    const invite = async (input: StaffInviteInput) => {
        const sent = await source.staff.invite(input);
        setInviteOpen(false);
        notify('success', t('admin.staff.okInvited', { email: sent.email }));
        query.reload();
    };

    /** Runs one row action, then reports and reloads. A failure leaves the row as it was. */
    const run = async (
        row: StaffRow,
        action: () => Promise<unknown>,
        done: string,
    ) => {
        setBusyId(row.id);

        try {
            await action();
            notify('success', done);
            query.reload();
        } catch (caught) {
            notify('error', errors.message(caught));
        } finally {
            setBusyId(null);
        }
    };

    const confirm = async () => {
        if (!pending) {
            return;
        }

        const { kind, row } = pending;
        await run(
            row,
            () =>
                kind === 'revoke'
                    ? source.staff.revoke(row.id)
                    : source.staff.setActive(row.id, false),
            t(
                kind === 'revoke'
                    ? 'admin.staff.okRevoked'
                    : 'admin.staff.okDeactivated',
            ),
        );
    };

    const target = pending?.row;
    const targetName = target?.name ?? target?.email ?? '';

    return (
        <>
            <Head title={t('admin.staff.title')} />
            <PageBody>
                <PageHeader
                    title={t('admin.staff.title')}
                    lead={t('admin.staff.sub')}
                    actions={
                        <Button onClick={() => setInviteOpen(true)}>
                            <Plus aria-hidden="true" />
                            {t('admin.staff.invite')}
                        </Button>
                    }
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('admin.staff.loading')}
                        blocks={[46, 72, 72, 72, 72]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && data && (
                    <>
                        {data.rows.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-line-strong">
                                <EmptyState
                                    icon={Users}
                                    title={t('admin.staff.emptyTitle')}
                                    description={t('admin.staff.emptyBody')}
                                    action={
                                        <Button
                                            onClick={() => setInviteOpen(true)}
                                        >
                                            <Plus aria-hidden="true" />
                                            {t('admin.staff.invite')}
                                        </Button>
                                    }
                                />
                            </div>
                        ) : (
                            <StaffTable
                                rows={data.rows}
                                busyId={busyId}
                                onResend={(row) =>
                                    run(
                                        row,
                                        () => source.staff.resend(row.id),
                                        t('admin.staff.okResent', {
                                            email: row.email,
                                        }),
                                    )
                                }
                                onRevoke={(row) =>
                                    setPending({ kind: 'revoke', row })
                                }
                                onDeactivate={(row) =>
                                    setPending({ kind: 'deactivate', row })
                                }
                                onReactivate={(row) =>
                                    run(
                                        row,
                                        () =>
                                            source.staff.setActive(
                                                row.id,
                                                true,
                                            ),
                                        t('admin.staff.okReactivated'),
                                    )
                                }
                            />
                        )}
                        <p className="text-label text-subtle">
                            {t('admin.staff.note')}
                        </p>
                    </>
                )}
            </PageBody>

            <InviteDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                onInvite={invite}
            />

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={
                    pending?.kind === 'revoke'
                        ? t('admin.staff.revokeTitle')
                        : t('admin.staff.deactivateTitle', {
                              name: targetName,
                          })
                }
                description={
                    pending?.kind === 'revoke'
                        ? t('admin.staff.revokeText', {
                              email: target?.email ?? '',
                          })
                        : t('admin.staff.deactivateText')
                }
                confirmLabel={
                    pending?.kind === 'revoke'
                        ? t('admin.staff.revoke')
                        : t('admin.staff.deactivate')
                }
                cancelLabel={t('admin.common.cancel')}
                onConfirm={confirm}
            />
        </>
    );
}
