import { Loader2, Mic, MicOff, Square, TriangleAlert } from 'lucide-react';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

export type VoiceState =
    'idle' | 'listening' | 'transcribing' | 'error' | 'denied';

const SPEC = {
    idle: {
        tone: 'bg-brand hover:bg-brand-hover',
        title: 'voice.idleTitle',
        help: 'voice.idleHelp',
    },
    listening: {
        tone: 'bg-danger hover:bg-danger-ink animate-pulse-ring motion-reduce:animate-none',
        title: 'voice.listeningTitle',
        help: 'voice.listeningHelp',
    },
    transcribing: {
        tone: 'bg-subtle',
        title: 'voice.workingTitle',
        help: 'voice.workingHelp',
    },
    error: {
        tone: 'bg-brand hover:bg-brand-hover',
        title: 'voice.errorTitle',
        help: 'voice.idleHelp',
    },
    denied: {
        tone: 'bg-mute',
        title: 'voice.deniedTitle',
        help: 'voice.idleHelp',
    },
} as const;

/**
 * The one voice control, reused on every booking screen. It is a view of a state the
 * caller owns (recording itself is wired up later), so the same component serves the real
 * recorder and the preview. A typed command box always sits beside it (see BookingPanel):
 * voice is never required.
 */
export function VoiceCaptureButton({
    state,
    onToggle,
    onTypeInstead,
    className,
}: {
    state: VoiceState;
    /** Tap: start listening when idle or after an error, stop (and send) while listening. */
    onToggle: () => void;
    /** Shown with the permission-denied and error messages. */
    onTypeInstead?: () => void;
    className?: string;
}) {
    const { t } = useT();
    const spec = SPEC[state];
    const blocked = state === 'denied';
    const busy = state === 'transcribing';
    const Icon =
        state === 'listening'
            ? Square
            : blocked
              ? MicOff
              : busy
                ? Loader2
                : Mic;

    return (
        <div
            className={cn(
                'flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-subtle px-4 py-[22px] text-center',
                className,
            )}
        >
            <button
                type="button"
                data-voice-state={state}
                aria-label={t(spec.title)}
                aria-disabled={blocked || busy || undefined}
                onClick={blocked || busy ? undefined : onToggle}
                className={cn(
                    'inline-flex size-[88px] items-center justify-center rounded-full text-white',
                    blocked || busy ? 'cursor-not-allowed' : 'cursor-pointer',
                    spec.tone,
                )}
            >
                <Icon
                    aria-hidden="true"
                    className={cn(
                        'size-[34px]',
                        state === 'listening' && 'size-7 fill-current',
                        busy && 'animate-spin motion-reduce:animate-none',
                    )}
                    strokeWidth={2.2}
                />
            </button>
            <strong className="text-body text-ink">{t(spec.title)}</strong>
            <span role="status" className="max-w-[340px] text-control">
                {t(spec.help)}
            </span>
            {(state === 'error' || blocked) && (
                <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-surface px-3.5 py-3 text-start text-control text-danger-deep"
                >
                    <TriangleAlert
                        aria-hidden="true"
                        className="mt-1 size-[18px] shrink-0"
                    />
                    <span className="flex flex-col items-start gap-1">
                        {blocked ? t('voice.deniedBody') : t('voice.errorBody')}
                        {onTypeInstead && (
                            <button
                                type="button"
                                onClick={onTypeInstead}
                                className="inline-flex min-h-11 items-center font-semibold text-brand-hover underline underline-offset-4"
                            >
                                {t('voice.typeInstead')}
                            </button>
                        )}
                    </span>
                </div>
            )}
            <span className="text-small text-subtle">{t('voice.silence')}</span>
        </div>
    );
}
