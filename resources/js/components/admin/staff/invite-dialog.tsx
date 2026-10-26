import { useState } from 'react';
import { FormDialog } from '@/components/admin/form-dialog';
import { TextField } from '@/components/vocamed/form-fields';
import { useErrorText } from '@/hooks/use-error-text';
import { useT } from '@/i18n/scope';
import { DataError, type StaffInviteInput } from '@/lib/data';

type Role = StaffInviteInput['role'];

/**
 * "Invite a team member": an email and a role. Field problems (not an email, already in use) show
 * under the email; anything else is left to the page to report.
 */
export function InviteDialog({
    open,
    onOpenChange,
    onInvite,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Rejects with the server's error; the dialog shows what belongs to the email field. */
    onInvite: (input: StaffInviteInput) => Promise<void>;
}) {
    const { t } = useT();
    const errors = useErrorText();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Role>('receptionist');
    const [error, setError] = useState('');
    const [general, setGeneral] = useState('');
    const [pending, setPending] = useState(false);

    // A fresh form each time it opens.
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);

        if (open) {
            setEmail('');
            setRole('receptionist');
            setError('');
            setGeneral('');
        }
    }

    const submit = async () => {
        setPending(true);
        setError('');
        setGeneral('');

        try {
            await onInvite({ email, role });
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'VALIDATION' &&
                caught.field === 'email'
            ) {
                setError(t('admin.staff.errEmail'));
            } else if (
                caught instanceof DataError &&
                caught.field === 'email'
            ) {
                setError(errors.message(caught));
            } else {
                setGeneral(errors.message(caught));
            }
        } finally {
            setPending(false);
        }
    };

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('admin.staff.dialogTitle')}
            description={t('admin.staff.dialogSub')}
            submitLabel={t('admin.staff.send')}
            cancelLabel={t('admin.common.cancel')}
            pending={pending}
            onSubmit={submit}
        >
            <TextField
                label={t('admin.staff.email')}
                type="email"
                dir="ltr"
                autoComplete="off"
                placeholder={t('admin.staff.emailPh')}
                value={email}
                error={error || undefined}
                onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                }}
            />
            <fieldset className="flex flex-col gap-0.5 border-0 p-0">
                <legend className="mb-2 p-0 text-label font-semibold text-ink">
                    {t('admin.staff.role')}
                </legend>
                {(
                    [
                        ['receptionist', 'admin.staff.roleReceptionist'],
                        ['clinic_admin', 'admin.staff.roleAdmin'],
                    ] as const
                ).map(([value, label]) => (
                    <label
                        key={value}
                        className="flex min-h-12 cursor-pointer items-center gap-3 text-control text-ink"
                    >
                        <input
                            type="radio"
                            name="staff-role"
                            checked={role === value}
                            onChange={() => setRole(value)}
                            className="m-0 size-[22px] accent-brand"
                        />
                        {t(label)}
                    </label>
                ))}
            </fieldset>
            {general && (
                <p
                    role="alert"
                    className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                >
                    {general}
                </p>
            )}
        </FormDialog>
    );
}
