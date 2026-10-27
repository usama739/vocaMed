import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
    success: 'border-success-line bg-success-surface text-success-ink',
    danger: 'border-danger-line bg-danger-surface text-danger-deep',
    info: 'border-brand-line bg-brand-tint text-brand-deep',
    warning: 'border-[#e3b341] bg-[#fff8e8] text-[#5c3900]',
} as const;

/**
 * A result or a rule, said in a box with an icon, a short title and a line of text: so the colour is
 * never the only signal. Results are announced; errors interrupt.
 */
export function Notice({
    tone,
    icon: Icon,
    title,
    children,
    role = 'status',
    className,
}: {
    tone: keyof typeof TONE;
    icon: LucideIcon;
    title: string;
    children?: ReactNode;
    role?: 'status' | 'alert' | 'note';
    className?: string;
}) {
    return (
        <div
            role={role}
            className={cn(
                'flex animate-rise items-start gap-3 rounded-[12px] border px-4 py-3.5 motion-reduce:animate-none',
                TONE[tone],
                className,
            )}
        >
            <Icon
                aria-hidden="true"
                className="mt-0.5 size-[22px] shrink-0"
                strokeWidth={2.4}
            />
            <div className="flex flex-col">
                <strong className="text-body">{title}</strong>
                {children && <span className="text-[14.5px]">{children}</span>}
            </div>
        </div>
    );
}
