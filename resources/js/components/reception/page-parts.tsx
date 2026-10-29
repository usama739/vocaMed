import { Link } from '@inertiajs/react';
import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { initialsOf } from '@/components/reception/format';
import { EmptyState, ErrorState } from '@/components/vocamed/states';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/** Every reception page starts the same way: a title, a lead line and the page's main actions. */
export function PageHeader({
    title,
    lead,
    actions,
    leading,
    children,
}: {
    title: string;
    lead?: ReactNode;
    actions?: ReactNode;
    /** Sits before the title (a patient's avatar). */
    leading?: ReactNode;
    /** Extra lines under the lead, e.g. the phone number. */
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
                {leading}
                <div className="flex max-w-[680px] min-w-0 flex-col gap-1.5">
                    <h1 className="text-heading font-bold text-ink">{title}</h1>
                    {lead && <p className="text-control">{lead}</p>}
                    {children}
                </div>
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2.5">
                    {actions}
                </div>
            )}
        </div>
    );
}

/** Sample data stays labelled as sample, on every page. */
export function SampleNote({ className }: { className?: string }) {
    const { t } = useT();

    return (
        <p className={cn('text-label text-subtle', className)}>
            {t('common.sample')}
        </p>
    );
}

/** The page body, with the rise-in animation. Reduced motion settles it instantly. */
export function PageBody({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex animate-rise flex-col gap-[22px] motion-reduce:animate-none',
                className,
            )}
        >
            {children}
        </div>
    );
}

/** A bordered white card with the 14px radius used inside pages. */
export function Card({
    children,
    className,
    as: Tag = 'section',
    ...props
}: {
    children: ReactNode;
    className?: string;
    as?: 'section' | 'div';
} & React.HTMLAttributes<HTMLElement>) {
    return (
        <Tag
            className={cn(
                'rounded-xl border border-line bg-white shadow-soft',
                className,
            )}
            {...props}
        >
            {children}
        </Tag>
    );
}

export function CardTitle({
    children,
    className,
    id,
}: {
    children: ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <h2
            id={id}
            className={cn('text-lead font-semibold text-ink', className)}
        >
            {children}
        </h2>
    );
}

/** A circle with initials in the name's own script (never a made-up photo). */
export function PatientAvatar({
    name,
    size = 'md',
    className,
}: {
    name: string;
    size?: 'md' | 'lg';
    className?: string;
}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-deep',
                size === 'lg' ? 'size-16 text-[22px]' : 'size-10 text-label',
                className,
            )}
        >
            {initialsOf(name)}
        </span>
    );
}

/** Loading skeleton block shaped like a card, announced once. */
export function PageLoading({
    label,
    blocks = [84, 260, 260],
}: {
    label: string;
    blocks?: number[];
}) {
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label={label}
            className="flex flex-col gap-3"
        >
            {blocks.map((height, index) => (
                <div
                    key={index}
                    aria-hidden="true"
                    style={{ height }}
                    className="animate-pulse rounded-xl bg-status-booked/60 motion-reduce:animate-none"
                />
            ))}
        </div>
    );
}

export function PageError({ onRetry }: { onRetry: () => void }) {
    return (
        <Card>
            <ErrorState onRetry={onRetry} />
        </Card>
    );
}

/** In-page "not found" until the shared 404 page exists. */
export function NotFoundPanel({
    title,
    body,
    backHref,
    backLabel,
}: {
    title: string;
    body: string;
    backHref: string;
    backLabel: string;
}) {
    return (
        <Card>
            <EmptyState
                icon={SearchX}
                title={title}
                description={body}
                action={
                    <Button variant="outline" asChild>
                        <Link href={backHref}>{backLabel}</Link>
                    </Button>
                }
            />
        </Card>
    );
}
