import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

type ConfirmCopy = {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
};

/** The dialog body. Exported so the preview can show it inline next to the live dialog. */
export function ConfirmDialogCard({
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone = 'danger',
    pending = false,
    onConfirm,
    onCancel,
    cancelRef,
    inline = false,
    className,
}: ConfirmCopy & {
    tone?: 'danger' | 'default';
    pending?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    cancelRef?: React.Ref<HTMLButtonElement>;
    /** Render as plain markup (the preview). Inside a real dialog, leave off. */
    inline?: boolean;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-3.5', className)}>
            {inline ? (
                <>
                    <h3 className="text-title font-semibold text-ink">
                        {title}
                    </h3>
                    <p className="text-control text-copy">{description}</p>
                </>
            ) : (
                <>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </>
            )}
            <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">
                <Button
                    ref={cancelRef}
                    variant="outline"
                    onClick={onCancel}
                    disabled={pending}
                >
                    {cancelLabel}
                </Button>
                <Button
                    variant={tone === 'danger' ? 'destructive' : 'default'}
                    onClick={onConfirm}
                    disabled={pending}
                >
                    {pending && <Spinner aria-hidden="true" />}
                    {confirmLabel}
                </Button>
            </div>
        </div>
    );
}

/**
 * Confirm before anything destructive (cancel an appointment, discard a booking).
 * Focus starts on the safe choice, so a stray Enter keeps the appointment.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    onConfirm,
    tone = 'danger',
    ...copy
}: ConfirmCopy & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** May be async; the buttons are disabled while it runs. */
    onConfirm: () => void | Promise<void>;
    tone?: 'danger' | 'default';
}) {
    const { locale, dir } = useT();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const [pending, setPending] = useState(false);

    const confirm = async () => {
        setPending(true);

        try {
            await onConfirm();
            onOpenChange(false);
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !pending && onOpenChange(next)}
        >
            <DialogContent
                role="alertdialog"
                dir={dir}
                lang={locale}
                showCloseButton={false}
                className="max-w-[460px] sm:max-w-[460px]"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    cancelRef.current?.focus();
                }}
            >
                <ConfirmDialogCard
                    {...copy}
                    tone={tone}
                    pending={pending}
                    onConfirm={confirm}
                    onCancel={() => onOpenChange(false)}
                    cancelRef={cancelRef}
                />
            </DialogContent>
        </Dialog>
    );
}
