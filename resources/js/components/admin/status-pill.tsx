import {
    CircleCheck,
    CircleMinus,
    Clock,
    Mail,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PillTone = 'active' | 'inactive' | 'invited' | 'expired';

const SPEC: Record<PillTone, { icon: LucideIcon; className: string }> = {
    active: { icon: CircleCheck, className: 'bg-[#dff3e4] text-[#14532d]' },
    inactive: { icon: CircleMinus, className: 'bg-[#e8ecf4] text-[#2f3a56]' },
    invited: { icon: Mail, className: 'bg-[#ddebfe] text-[#0b4491]' },
    expired: { icon: Clock, className: 'bg-[#fff1cc] text-[#6b4300]' },
};

/** A small status label with an icon and text, so colour is never the only signal. */
export function StatusPill({
    tone,
    children,
    className,
}: {
    tone: PillTone;
    children: string;
    className?: string;
}) {
    const { icon: Icon, className: colour } = SPEC[tone];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[13.5px] font-semibold',
                colour,
                className,
            )}
        >
            <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
            {children}
        </span>
    );
}
