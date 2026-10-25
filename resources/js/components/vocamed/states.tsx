import { Inbox, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/** Every page handles four states: loading, empty (with a next action), error (with Retry), reconnecting. */

export function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
    className,
}: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    /** The next step the user can take, usually a button. */
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-2.5 px-6 py-12 text-center',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className="inline-flex size-14 items-center justify-center rounded-full bg-surface-hover text-subtle"
            >
                <Icon className="size-7" />
            </span>
            <strong className="text-lead text-ink">{title}</strong>
            {description && (
                <p className="max-w-md text-control">{description}</p>
            )}
            {action && <div className="mt-1.5">{action}</div>}
        </div>
    );
}

/** Placeholder lines shaped like the content that is loading. Announced once, not per line. */
export function LoadingState({
    rows = 4,
    className,
}: {
    rows?: number;
    className?: string;
}) {
    const { t } = useT();

    return (
        <div
            role="status"
            aria-busy="true"
            className={cn('flex flex-col gap-3 p-5', className)}
        >
            <span className="sr-only">{t('states.loading')}</span>
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="flex items-center gap-4"
                >
                    <Skeleton className="h-10 w-28" />
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="hidden h-10 w-24 sm:block" />
                </div>
            ))}
        </div>
    );
}

export function ErrorState({
    title,
    description,
    onRetry,
    className,
}: {
    title?: string;
    description?: string;
    onRetry: () => void;
    className?: string;
}) {
    const { t } = useT();

    return (
        <div
            role="alert"
            className={cn(
                'flex flex-col items-center gap-2.5 px-6 py-12 text-center',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className="inline-flex size-14 items-center justify-center rounded-full bg-danger-surface text-danger-ink"
            >
                <TriangleAlert className="size-7" />
            </span>
            <strong className="text-lead text-ink">
                {title ?? t('states.errorTitle')}
            </strong>
            <p className="max-w-md text-control">
                {description ?? t('states.errorBody')}
            </p>
            <Button variant="outline" className="mt-1.5" onClick={onRetry}>
                {t('common.retry')}
            </Button>
        </div>
    );
}

/** Shown while the live connection is down; data refreshes by itself when it returns. */
export function ReconnectingBanner({ className }: { className?: string }) {
    const { t } = useT();

    return (
        <div
            role="status"
            className={cn(
                'flex items-center gap-2.5 border-b border-warning-line bg-warning-surface px-6 py-3 text-control font-semibold text-warning-ink',
                className,
            )}
        >
            <WifiOff aria-hidden="true" className="size-[18px] shrink-0" />
            {t('states.reconnecting')}
        </div>
    );
}
