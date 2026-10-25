import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Locale } from '@/i18n/locales';
import { LocaleScope, useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

const TONES = {
    success: {
        icon: CircleCheck,
        className: 'border-success-line bg-success-surface text-success-ink',
    },
    error: {
        icon: CircleAlert,
        className: 'border-danger-line bg-danger-surface text-danger-deep',
    },
    warning: {
        icon: TriangleAlert,
        className: 'border-warning-line bg-warning-surface text-warning-ink',
    },
    info: {
        icon: Info,
        className: 'border-brand-line bg-brand-tint text-brand-deep',
    },
} as const;

/** The toast body. Exported so the preview can show it without firing a real toast. */
export function ToastCard({
    tone,
    message,
    onDismiss,
    className,
}: {
    tone: ToastTone;
    message: string;
    onDismiss?: () => void;
    className?: string;
}) {
    const { t } = useT();
    const { icon: Icon, className: toneClass } = TONES[tone];

    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={cn(
                'flex w-[min(92vw,420px)] items-center gap-3 rounded-lg border py-1 ps-4 pe-1 text-control font-semibold shadow-menu',
                toneClass,
                className,
            )}
        >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1 py-2">{message}</span>
            {onDismiss && (
                <button
                    type="button"
                    aria-label={t('common.dismiss')}
                    onClick={onDismiss}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
                >
                    <X aria-hidden="true" className="size-5" />
                </button>
            )}
        </div>
    );
}

/**
 * Fire a toast from anywhere (needs the app's <Toaster />). Errors stay until dismissed;
 * the rest clear themselves. Pass `locale` to pin the language (the preview does).
 */
export function notify(
    tone: ToastTone,
    message: string,
    options: { locale?: Locale } = {},
): string | number {
    return toast.custom(
        (id) => {
            const card = (
                <ToastCard
                    tone={tone}
                    message={message}
                    onDismiss={() => toast.dismiss(id)}
                />
            );

            return options.locale ? (
                <LocaleScope locale={options.locale}>{card}</LocaleScope>
            ) : (
                card
            );
        },
        { duration: tone === 'error' ? Infinity : 5000 },
    );
}
