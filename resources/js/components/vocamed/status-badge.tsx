import {
    Activity,
    CalendarDays,
    CheckCheck,
    CircleCheck,
    CircleX,
    Clock,
    LogIn,
    Send,
    TriangleAlert,
    UserX,
    type LucideIcon,
} from 'lucide-react';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';
import type { AppointmentStatus, NotificationStatus } from '@/lib/data';

export type BadgeStatus = AppointmentStatus | NotificationStatus;

type BadgeSpec = {
    icon: LucideIcon;
    label:
        | `status.${AppointmentStatus}`
        | `notificationStatus.${NotificationStatus}`;
    className: string;
};

// Every status has its own icon AND label, so colour is never the only signal.
const SPEC: Record<BadgeStatus, BadgeSpec> = {
    booked: {
        icon: CalendarDays,
        label: 'status.booked',
        className: 'bg-status-booked text-status-booked-ink',
    },
    confirmed: {
        icon: CircleCheck,
        label: 'status.confirmed',
        className: 'bg-status-confirmed text-status-confirmed-ink',
    },
    arrived: {
        icon: LogIn,
        label: 'status.arrived',
        className: 'bg-status-arrived text-status-arrived-ink',
    },
    in_consultation: {
        icon: Activity,
        label: 'status.in_consultation',
        className: 'bg-status-consult text-status-consult-ink',
    },
    done: {
        icon: CheckCheck,
        label: 'status.done',
        className: 'bg-status-done text-status-done-ink',
    },
    cancelled: {
        icon: CircleX,
        label: 'status.cancelled',
        className: 'bg-status-cancelled text-status-cancelled-ink',
    },
    no_show: {
        icon: UserX,
        label: 'status.no_show',
        className: 'bg-status-noshow text-status-noshow-ink',
    },
    queued: {
        icon: Clock,
        label: 'notificationStatus.queued',
        className: 'bg-status-booked text-status-booked-ink',
    },
    sent: {
        icon: Send,
        label: 'notificationStatus.sent',
        className: 'bg-status-confirmed text-status-confirmed-ink',
    },
    delivered: {
        icon: CheckCheck,
        label: 'notificationStatus.delivered',
        className: 'bg-status-done text-status-done-ink',
    },
    failed: {
        icon: TriangleAlert,
        label: 'notificationStatus.failed',
        className: 'bg-status-cancelled text-status-cancelled-ink',
    },
};

/** Icon, label key and colours per status, so other views (the calendar) draw the same look. */
export const BADGE_SPEC = SPEC;

export const BADGE_STATUSES = Object.keys(SPEC) as BadgeStatus[];

export function StatusBadge({
    status,
    className,
}: {
    status: BadgeStatus;
    className?: string;
}) {
    const { t } = useT();
    const { icon: Icon, label, className: tone } = SPEC[status];

    return (
        <span
            data-status={status}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-small leading-[1.4] font-semibold whitespace-nowrap',
                tone,
                className,
            )}
        >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {t(label)}
        </span>
    );
}
