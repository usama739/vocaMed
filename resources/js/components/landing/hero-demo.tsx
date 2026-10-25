import { Clock, Mic, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCountdown } from '@/components/vocamed/booking/format';
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';
import { heroFrame, staticFrame, TICK_MS } from './hero-frame';

function Field({
    label,
    value,
    filled,
    flagged = false,
    flagLabel,
}: {
    label: string;
    value: string;
    filled: boolean;
    flagged?: boolean;
    flagLabel?: string;
}) {
    return (
        <div
            className={cn(
                'rounded-md px-3.5 py-2.5 transition-colors duration-300',
                flagged && filled
                    ? 'border-2 border-warning-accent bg-warning-surface'
                    : 'border border-line',
            )}
        >
            <div
                className={cn(
                    'flex items-center gap-1.5 text-caption font-medium',
                    flagged && filled ? 'text-warning-ink' : 'text-subtle',
                )}
            >
                {flagged && filled && (
                    <TriangleAlert
                        aria-hidden="true"
                        className="size-[13px] animate-pop"
                        strokeWidth={2.2}
                    />
                )}
                {flagged && filled ? flagLabel : label}
            </div>
            {filled ? (
                <div
                    key="value"
                    className="animate-fade text-control font-semibold text-ink"
                >
                    {value}
                </div>
            ) : (
                <div
                    aria-hidden="true"
                    className="mt-1.5 h-4 w-24 animate-pulse rounded-xs bg-line-soft"
                />
            )}
        </div>
    );
}

/**
 * The product window in the landing hero: a "New booking" card that plays through a sample
 * booking on a loop. Purely decorative, so it is hidden from assistive technology and
 * pauses under the pointer. Reduced motion shows the finished card instead.
 */
export function HeroDemo() {
    const { t } = useT();
    const reduced = usePrefersReducedMotion();
    const [paused, setPaused] = useState(false);
    const [tick, setTick] = useState(0);
    const transcript = t('landing.mock.transcript');

    useEffect(() => {
        if (reduced || paused) {
            return;
        }

        const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS);

        return () => window.clearInterval(timer);
    }, [reduced, paused]);

    const frame = reduced
        ? staticFrame(transcript.length)
        : heroFrame(tick, transcript.length);

    return (
        <div
            aria-hidden="true"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift transition-shadow duration-300 hover:shadow-panel"
        >
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-[18px] py-3.5">
                <span className="text-control font-bold text-ink">
                    {t('landing.mock.title')}
                </span>
                <div className="inline-flex rounded-[9px] bg-surface-held p-[3px]">
                    <span className="rounded-[7px] bg-white px-3.5 py-[5px] text-small font-semibold text-ink shadow-xs">
                        {t('landing.mock.voice')}
                    </span>
                    <span className="px-3.5 py-[5px] text-small font-semibold text-subtle">
                        {t('landing.mock.manual')}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-4 p-[18px]">
                <div className="flex items-start gap-3 rounded-lg border border-line-soft bg-surface-subtle p-3.5">
                    <span
                        className={cn(
                            'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white',
                            frame.listening && 'animate-pulse-ring',
                        )}
                    >
                        <Mic className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-caption font-semibold tracking-[0.04em] text-subtle uppercase">
                            {t('landing.mock.heard')}
                        </span>
                        <span className="min-h-[3em] text-control leading-normal text-ink">
                            {transcript.slice(0, frame.chars)}
                            {!reduced && frame.chars < transcript.length && (
                                <span className="ms-px inline-block h-4 w-px animate-caret bg-ink align-middle" />
                            )}
                        </span>
                        <span className="text-small font-semibold text-brand-hover">
                            {t('landing.mock.type')}
                        </span>
                    </div>
                </div>

                <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className="text-small font-semibold text-copy">
                        {t('landing.mock.review')}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 text-small font-semibold text-copy transition-opacity duration-300',
                            frame.holdSeconds === null && 'opacity-0',
                        )}
                    >
                        <Clock className="size-3.5" />
                        <span>
                            {t('landing.mock.hold', {
                                time: formatCountdown(frame.holdSeconds ?? 108),
                            })}
                        </span>
                    </span>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5">
                    <Field
                        label={t('landing.mock.patient')}
                        value={t('landing.mock.vPatient')}
                        filled={frame.fields >= 1}
                    />
                    <Field
                        label={t('landing.mock.doctor')}
                        value={t('landing.mock.vDoctor')}
                        filled={frame.fields >= 2}
                    />
                    <Field
                        label={t('landing.mock.service')}
                        value={t('landing.mock.vService')}
                        filled={frame.fields >= 3}
                    />
                    <Field
                        label={t('landing.patient.when')}
                        flagLabel={t('landing.mock.check')}
                        value={t('landing.mock.vWhen')}
                        filled={frame.fields >= 4}
                        flagged
                    />
                </div>

                <div className="flex flex-wrap gap-2.5">
                    <span
                        className={cn(
                            'inline-flex min-h-12 flex-[1_1_140px] items-center justify-center rounded-md bg-brand text-control font-semibold text-white transition-[transform,box-shadow] duration-150',
                            frame.pressed && 'scale-[0.97] shadow-glow',
                        )}
                    >
                        {t('landing.mock.confirm')}
                    </span>
                    <span className="inline-flex min-h-12 items-center justify-center rounded-md border border-line-strong px-5 text-control font-semibold text-ink">
                        {t('landing.mock.edit')}
                    </span>
                    <span className="inline-flex min-h-12 items-center justify-center rounded-md px-5 text-control font-semibold text-copy">
                        {t('landing.mock.discard')}
                    </span>
                </div>
            </div>
        </div>
    );
}
