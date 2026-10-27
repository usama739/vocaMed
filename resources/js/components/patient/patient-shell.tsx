import { Link } from '@inertiajs/react';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/vocamed/brand-mark';
import { LanguageSwitch } from '@/components/vocamed/language-switch';
import { cn } from '@/lib/utils';

/**
 * The frame of every patient page: a header with the clinic's name (or the VocaMed mark when the
 * link does not say which clinic) and the language switch, then one centred column. It is built for
 * a phone; on a larger screen the same column is centred rather than stretched.
 */
export function PatientShell({
    clinicName,
    back,
    children,
    className,
}: {
    clinicName?: string | null;
    /** A link back, in place of the clinic name (the reschedule page). */
    back?: { href: string; label: string };
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className="flex min-h-dvh flex-col bg-canvas text-copy">
            <header className="border-b border-line bg-white">
                <div className="mx-auto flex w-full max-w-[480px] items-center justify-between gap-3 px-4 py-3.5">
                    {back ? (
                        <Link
                            href={back.href}
                            className="inline-flex min-h-11 items-center gap-1.5 text-control font-semibold text-brand-hover"
                        >
                            <ChevronLeft
                                aria-hidden="true"
                                className="size-[18px] rtl:-scale-x-100"
                                strokeWidth={2.4}
                            />
                            {back.label}
                        </Link>
                    ) : (
                        <span className="flex min-w-0 items-center gap-2.5">
                            <BrandMark className="rounded-[10px]" />
                            <strong className="truncate text-body text-ink">
                                {clinicName ?? 'VocaMed'}
                            </strong>
                        </span>
                    )}
                    <LanguageSwitch />
                </div>
            </header>
            <main
                className={cn(
                    'mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 pt-5 pb-7',
                    className,
                )}
            >
                {children}
            </main>
        </div>
    );
}

/** The page title and the line under it. */
export function PatientHeading({
    title,
    lead,
}: {
    title: string;
    lead?: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <h1 className="text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-ink">
                {title}
            </h1>
            {lead && <p className="text-control">{lead}</p>}
        </div>
    );
}
