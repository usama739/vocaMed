import {
    CircleAlert,
    Clock,
    Lock,
    Mail,
    TriangleAlert,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/** White card used by every sign-in page. The heading takes focus when a new state replaces the form. */
export function AuthCard({
    title,
    lead,
    children,
    focusTitle = false,
    className,
}: {
    title: string;
    lead?: ReactNode;
    children: ReactNode;
    focusTitle?: boolean;
    className?: string;
}) {
    const heading = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        if (focusTitle) {
            heading.current?.focus();
        }
    }, [focusTitle]);

    return (
        <section
            aria-labelledby="auth-title"
            className={cn(
                'flex animate-rise flex-col gap-[22px] rounded-3xl border border-line/70 bg-white p-8 shadow-float sm:p-10',
                className,
            )}
        >
            <div className="flex flex-col gap-1.5">
                <h1
                    id="auth-title"
                    ref={heading}
                    tabIndex={-1}
                    className="text-heading font-bold text-ink outline-none"
                >
                    {title}
                </h1>
                {lead && <p className="text-control">{lead}</p>}
            </div>
            {children}
        </section>
    );
}

const TONES = {
    info: 'bg-brand-tint text-brand-hover',
    success: 'bg-status-done text-status-done-ink',
    warning: 'bg-status-noshow text-status-noshow-ink',
    neutral: 'bg-status-booked text-status-booked-ink',
} as const;

export type StatusTone = keyof typeof TONES;

const ICONS: Record<StatusTone, LucideIcon> = {
    info: Mail,
    success: Mail,
    warning: Clock,
    neutral: Lock,
};

/** A check that draws itself, for the success state. */
function DrawnCheck() {
    return (
        <svg
            aria-hidden="true"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path
                d="m9 12 2 2 4-4"
                strokeDasharray="30"
                className="animate-draw"
            />
        </svg>
    );
}

/**
 * The centred "icon, title, text, action" card for *sent*, *done*, *expired* and *used* states.
 * It replaces the form in place and moves focus to its title so a screen reader announces it.
 */
export function StatusPanel({
    tone,
    icon,
    title,
    children,
    actions,
}: {
    tone: StatusTone;
    /** Overrides the tone's default icon. */
    icon?: LucideIcon;
    title: string;
    children?: ReactNode;
    actions?: ReactNode;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const Icon = icon ?? ICONS[tone];

    useEffect(() => {
        heading.current?.focus();
    }, []);

    return (
        <section
            aria-labelledby="status-title"
            className="flex animate-fade flex-col items-center gap-4 rounded-3xl border border-line/70 bg-white px-8 py-10 text-center shadow-float"
        >
            <span
                aria-hidden="true"
                className={cn(
                    'inline-flex size-16 animate-pop items-center justify-center rounded-full',
                    TONES[tone],
                )}
            >
                {tone === 'success' && !icon ? (
                    <DrawnCheck />
                ) : (
                    <Icon className="size-[30px]" strokeWidth={2} />
                )}
            </span>
            <h1
                id="status-title"
                ref={heading}
                tabIndex={-1}
                className="text-heading font-bold text-ink outline-none"
            >
                {title}
            </h1>
            {children && (
                <div className="flex max-w-[400px] flex-col gap-3 text-body">
                    {children}
                </div>
            )}
            {actions && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                    {actions}
                </div>
            )}
        </section>
    );
}

/** Inline alert above a form: wrong password, throttled, server error. Icon plus text, announced on arrival. */
export function FormAlert({
    tone = 'danger',
    children,
}: {
    tone?: 'danger' | 'warning';
    children: ReactNode;
}) {
    const Icon = tone === 'danger' ? CircleAlert : TriangleAlert;

    return (
        <div
            role="alert"
            className={cn(
                'flex animate-rise items-start gap-2.5 rounded-lg border px-3.5 py-3 text-label font-medium',
                tone === 'danger'
                    ? 'border-danger-line bg-danger-surface text-danger-deep'
                    : 'border-warning-line bg-warning-surface text-warning-ink',
            )}
        >
            <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
            <span>{children}</span>
        </div>
    );
}

/** Placeholder card while a token is being checked (reset link, invitation). Announced once. */
export function AuthCardSkeleton() {
    const { t } = useT();

    return (
        <div
            role="status"
            aria-busy="true"
            className="flex animate-fade flex-col gap-4 rounded-3xl border border-line/70 bg-white p-8 shadow-float"
        >
            <span className="sr-only">{t('states.loading')}</span>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[52px] w-full" />
        </div>
    );
}
