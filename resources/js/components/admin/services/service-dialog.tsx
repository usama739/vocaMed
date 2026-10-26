import { useState } from 'react';
import { FormDialog } from '@/components/admin/form-dialog';
import { MinutesStepper } from '@/components/admin/services/minutes-stepper';
import { CheckboxField, TextField } from '@/components/vocamed/form-fields';
import { useErrorText } from '@/hooks/use-error-text';
import { useT } from '@/i18n/scope';
import {
    DataError,
    type Doctor,
    type Id,
    type ServiceInput,
    type ServiceRow,
} from '@/lib/data';

const STEP = 5;

type Draft = { name: string; dur: number; buf: number; doctorIds: Id[] };

const BLANK: Draft = { name: '', dur: 30, buf: 10, doctorIds: [] };

const draftOf = (row: ServiceRow | null): Draft =>
    row
        ? {
              name: row.service.name,
              dur: row.service.durationMin,
              buf: row.service.bufferMin,
              doctorIds: row.doctorIds,
          }
        : BLANK;

/**
 * Add or edit a service: name, duration and buffer in 5-minute steps, and which doctors offer it
 * (every doctor is listed; one who is inactive says so). `row` is null when adding.
 */
export function ServiceDialog({
    open,
    onOpenChange,
    row,
    doctors,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    row: ServiceRow | null;
    doctors: Doctor[];
    /** Rejects with the server's error; the name's problems show under the name. */
    onSave: (input: ServiceInput) => Promise<void>;
}) {
    const { t } = useT();
    const errors = useErrorText();
    const [draft, setDraft] = useState<Draft>(BLANK);
    const [nameError, setNameError] = useState('');
    const [general, setGeneral] = useState('');
    const [pending, setPending] = useState(false);

    // A fresh form each time it opens (the draft starts from the row that was clicked).
    const [wasOpen, setWasOpen] = useState(false);

    if (open !== wasOpen) {
        setWasOpen(open);

        if (open) {
            setDraft(draftOf(row));
            setNameError('');
            setGeneral('');
        }
    }

    const minutes = (value: number) => t('admin.common.min', { count: value });

    const submit = async () => {
        setPending(true);
        setNameError('');
        setGeneral('');

        try {
            await onSave({
                name: draft.name,
                durationMin: draft.dur,
                bufferMin: draft.buf,
                doctorIds: draft.doctorIds,
            });
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'VALIDATION' &&
                caught.field === 'name'
            ) {
                setNameError(t('admin.services.errName'));
            } else if (caught instanceof DataError && caught.field === 'name') {
                setNameError(errors.message(caught));
            } else {
                setGeneral(errors.message(caught));
            }
        } finally {
            setPending(false);
        }
    };

    const toggleDoctor = (id: Id, on: boolean) =>
        setDraft((d) => ({
            ...d,
            doctorIds: on
                ? [...d.doctorIds, id]
                : d.doctorIds.filter((x) => x !== id),
        }));

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t(
                row ? 'admin.services.editTitle' : 'admin.services.newTitle',
            )}
            submitLabel={t('admin.services.save')}
            cancelLabel={t('admin.common.cancel')}
            pending={pending}
            onSubmit={submit}
        >
            <TextField
                label={t('admin.services.name')}
                value={draft.name}
                error={nameError || undefined}
                onChange={(event) => {
                    setDraft((d) => ({ ...d, name: event.target.value }));
                    setNameError('');
                }}
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-4">
                <MinutesStepper
                    label={t('admin.services.duration')}
                    valueLabel={minutes(draft.dur)}
                    lessLabel={t('admin.services.less')}
                    moreLabel={t('admin.services.more')}
                    canLess={draft.dur - STEP >= 5}
                    canMore={draft.dur + STEP <= 180}
                    onLess={() =>
                        setDraft((d) => ({ ...d, dur: d.dur - STEP }))
                    }
                    onMore={() =>
                        setDraft((d) => ({ ...d, dur: d.dur + STEP }))
                    }
                />
                <MinutesStepper
                    label={t('admin.services.buffer')}
                    valueLabel={minutes(draft.buf)}
                    lessLabel={t('admin.services.less')}
                    moreLabel={t('admin.services.more')}
                    canLess={draft.buf - STEP >= 0}
                    canMore={draft.buf + STEP <= 60}
                    onLess={() =>
                        setDraft((d) => ({ ...d, buf: d.buf - STEP }))
                    }
                    onMore={() =>
                        setDraft((d) => ({ ...d, buf: d.buf + STEP }))
                    }
                />
            </div>
            <fieldset className="flex flex-col gap-0.5 border-0 p-0">
                <legend className="mb-2 p-0 text-label font-semibold text-ink">
                    {t('admin.services.offeredBy')}
                </legend>
                {doctors.map((doctor) => (
                    <CheckboxField
                        key={doctor.id}
                        className="min-h-[46px]"
                        label={
                            doctor.active
                                ? doctor.name
                                : t('admin.services.inactiveDoctor', {
                                      name: doctor.name,
                                  })
                        }
                        checked={draft.doctorIds.includes(doctor.id)}
                        onCheckedChange={(on) => toggleDoctor(doctor.id, on)}
                    />
                ))}
                {draft.doctorIds.length === 0 && (
                    <p className="pt-1 text-label text-subtle">
                        {t('admin.services.noneOffer')}
                    </p>
                )}
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
