import { Check, Loader2 } from 'lucide-react';
import { useT } from '@/i18n/scope';
import { canMoveStatus, type AppointmentStatus } from '@/lib/data';
import { cn } from '@/lib/utils';

/** The stages a receptionist moves a patient through on the day. */
export const DAY_STAGES = [
    'arrived',
    'in_consultation',
    'done',
    'no_show',
] as const satisfies readonly AppointmentStatus[];

/**
 * Arrived / In consultation / Done / No-show for one appointment. Each is a real toggle button:
 * pressing the active stage again undoes it. A stage the appointment cannot move to is disabled.
 */
export function StatusToggleGroup({
    patientName,
    status,
    pending,
    onToggle,
}: {
    patientName: string;
    status: AppointmentStatus;
    /** The stage being saved, shown with a spinner. */
    pending?: AppointmentStatus | null;
    onToggle: (stage: AppointmentStatus) => void;
}) {
    const { t } = useT();

    return (
        <div
            role="group"
            aria-label={t('reception.today.statusGroup', {
                patient: patientName,
            })}
            className="flex flex-wrap gap-1.5"
        >
            {DAY_STAGES.map((stage) => {
                const on = status === stage;
                const busy = pending === stage;
                const blocked = !on && !canMoveStatus(status, stage);

                return (
                    <button
                        key={stage}
                        type="button"
                        aria-pressed={on}
                        disabled={blocked || pending != null}
                        onClick={() => onToggle(stage)}
                        className={cn(
                            'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-label font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
                            on
                                ? 'border-brand bg-brand-tint text-brand-deep'
                                : 'border-line-strong bg-white text-ink-soft hover:bg-surface-hover',
                        )}
                    >
                        {busy ? (
                            <Loader2
                                aria-hidden="true"
                                className="size-3.5 animate-spin motion-reduce:animate-none"
                            />
                        ) : (
                            on && (
                                <Check
                                    aria-hidden="true"
                                    className="size-3.5 animate-pop motion-reduce:animate-none"
                                    strokeWidth={3}
                                />
                            )
                        )}
                        {t(`status.${stage}`)}
                    </button>
                );
            })}
        </div>
    );
}
