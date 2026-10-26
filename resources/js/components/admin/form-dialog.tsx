import { Loader2 } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/**
 * A small form in a dialog: a title, fields, and Cancel / Submit. Enter submits, Escape and the
 * Cancel button close it, and focus returns to what opened it. Used by Invite staff and Edit service.
 */
export function FormDialog({
    open,
    onOpenChange,
    title,
    description,
    submitLabel,
    cancelLabel,
    pending = false,
    onSubmit,
    children,
    className,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    submitLabel: string;
    cancelLabel: string;
    pending?: boolean;
    onSubmit: () => void | Promise<void>;
    children: ReactNode;
    className?: string;
}) {
    const { locale, dir } = useT();

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void onSubmit();
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !pending && onOpenChange(next)}
        >
            <DialogContent
                dir={dir}
                lang={locale}
                showCloseButton={false}
                className={cn('max-w-[520px] sm:max-w-[520px]', className)}
            >
                <form
                    onSubmit={submit}
                    noValidate
                    className="flex flex-col gap-[18px]"
                >
                    <div className="flex flex-col gap-1">
                        <DialogTitle>{title}</DialogTitle>
                        {description && (
                            <DialogDescription>{description}</DialogDescription>
                        )}
                    </div>
                    {children}
                    <div className="flex flex-wrap justify-end gap-2.5">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onOpenChange(false)}
                        >
                            {cancelLabel}
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending && (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin motion-reduce:animate-none"
                                />
                            )}
                            {submitLabel}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
