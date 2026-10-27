import { Loader2 } from 'lucide-react';
import { useRef, type RefObject } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/scope';
import { PatientButton } from './patient-button';

/**
 * Asks before cancelling. A bottom sheet on a phone and a centred dialog from 640px up. Focus starts
 * on the safe choice, so a stray tap keeps the appointment.
 */
export function CancelSheet({
    open,
    onOpenChange,
    onConfirm,
    pending,
    returnFocusTo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    pending: boolean;
    /** Where focus goes when the sheet closes: the button that opened it. */
    returnFocusTo?: RefObject<HTMLElement | null>;
}) {
    const { t, locale, dir } = useT();
    const keepRef = useRef<HTMLButtonElement>(null);

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
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    returnFocusTo?.current?.focus();
                }}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    keepRef.current?.focus();
                }}
                className="gap-3.5 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[20px] max-sm:rounded-b-none max-sm:px-5 max-sm:pt-6 max-sm:pb-7 max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=open]:slide-in-from-bottom-full sm:max-w-[420px] sm:p-7"
            >
                <DialogTitle className="text-title font-semibold text-ink">
                    {t('patient.manage.sheet.title')}
                </DialogTitle>
                <DialogDescription className="text-control">
                    {t('patient.manage.sheet.text')}
                </DialogDescription>
                <PatientButton
                    tone="destructive"
                    disabled={pending}
                    onClick={onConfirm}
                >
                    {pending && (
                        <Loader2
                            aria-hidden="true"
                            className="animate-spin motion-reduce:animate-none"
                        />
                    )}
                    {pending
                        ? t('patient.manage.sheet.cancelling')
                        : t('patient.manage.sheet.yes')}
                </PatientButton>
                <PatientButton
                    ref={keepRef}
                    tone="outline"
                    disabled={pending}
                    onClick={() => onOpenChange(false)}
                >
                    {t('patient.manage.sheet.no')}
                </PatientButton>
            </DialogContent>
        </Dialog>
    );
}
