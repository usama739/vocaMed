import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BADGE_STATUSES, StatusBadge } from '@/components/vocamed/status-badge';
import {
    VoiceCaptureButton,
    type VoiceState,
} from '@/components/vocamed/voice-capture-button';
import { Bilingual, Caption, Section } from '@/preview/shared';
import { COLOR_GROUPS, RADII, SHADOWS, TYPE_SCALE } from '@/preview/tokens';

function Swatch({
    cssVar,
    hex,
    name,
    use,
}: {
    cssVar: string;
    hex: string;
    name: string;
    use: string;
}) {
    return (
        <li className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <span
                aria-hidden="true"
                className="size-11 shrink-0 rounded-md border border-line"
                style={{ background: `var(${cssVar})` }}
            />
            <span className="min-w-0 text-small leading-snug">
                <span className="block font-semibold text-ink">{name}</span>
                <span className="block font-mono text-copy uppercase">
                    {hex}
                </span>
                <span className="block text-subtle">{use}</span>
            </span>
        </li>
    );
}

export function TokensSection() {
    return (
        <Section
            id="tokens"
            title="Design tokens"
            note="Extracted from the design canvas into resources/css/app.css (@theme). Every value below is read from the live CSS variable. The same list is in docs/design-tokens.md."
        >
            {COLOR_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-3">
                    <Caption>{group.title}</Caption>
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.tokens.map((token) => (
                            <Swatch key={token.name} {...token} />
                        ))}
                    </ul>
                </div>
            ))}

            <div className="flex flex-col gap-3">
                <Caption>Type scale · Inter and Noto Naskh Arabic</Caption>
                <div className="grid gap-6 xl:grid-cols-2">
                    <ul
                        className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
                        lang="en"
                        dir="ltr"
                    >
                        {TYPE_SCALE.map((step) => (
                            <li
                                key={step.cls}
                                className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-3 last:border-0 last:pb-0"
                            >
                                <span className={`${step.cls} text-ink`}>
                                    Sample text
                                </span>
                                <span className="text-small text-subtle">
                                    {step.cls} · {step.size} · {step.use}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <ul
                        className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
                        lang="ur"
                        dir="rtl"
                    >
                        {TYPE_SCALE.map((step) => (
                            <li
                                key={step.cls}
                                className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-3 last:border-0 last:pb-0"
                            >
                                <span className={`${step.cls} text-ink`}>
                                    نمونہ متن
                                </span>
                                <span
                                    className="text-small text-subtle"
                                    lang="en"
                                    dir="ltr"
                                >
                                    {step.cls}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="text-small text-subtle">
                    Urdu uses line-height 2 for body text and 1.55 for headings;
                    Latin headings use 1.2 with −0.01em tracking.
                </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <Caption>Radii</Caption>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {RADII.map((radius) => (
                            <li
                                key={radius.cls}
                                className="flex flex-col gap-2 text-small"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`${radius.cls} h-16 border-2 border-brand bg-brand-tint`}
                                />
                                <span className="font-semibold text-ink">
                                    {radius.cls} · {radius.px}
                                </span>
                                <span className="text-subtle">
                                    {radius.use}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex flex-col gap-3">
                    <Caption>Shadows</Caption>
                    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                        {SHADOWS.map((shadow) => (
                            <li
                                key={shadow.cls}
                                className="flex flex-col gap-2 text-small"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`${shadow.cls} h-16 rounded-xl border border-line-soft bg-white`}
                                />
                                <span className="font-semibold text-ink">
                                    {shadow.cls}
                                </span>
                                <span className="text-subtle">
                                    {shadow.use}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <Caption>
                    Focus ring · 3px brand blue, 2px off the element, on every
                    interactive element
                </Caption>
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-5">
                    <Button>Tab to me</Button>
                    <Button variant="outline">Then to me</Button>
                    <a
                        href="#tokens"
                        className="inline-flex min-h-11 items-center rounded-sm px-2 font-semibold text-brand-hover underline underline-offset-4"
                    >
                        A link
                    </a>
                    <input
                        aria-label="Focus ring on an input"
                        placeholder="An input"
                        className="h-12 rounded-md border border-line-strong px-3.5 text-body"
                    />
                </div>
            </div>
        </Section>
    );
}

export function StatusBadgeSection() {
    return (
        <Section
            id="status-badge"
            title="Status badge"
            note="Icon plus label, never colour alone. Appointment statuses first, then message statuses."
        >
            <Bilingual>
                <ul className="flex flex-wrap gap-3">
                    {BADGE_STATUSES.map((status) => (
                        <li key={status}>
                            <StatusBadge status={status} />
                        </li>
                    ))}
                </ul>
            </Bilingual>
        </Section>
    );
}

const SEQUENCE: Record<VoiceState, VoiceState> = {
    idle: 'listening',
    listening: 'transcribing',
    transcribing: 'idle',
    error: 'listening',
    denied: 'denied',
};

function VoiceDemo({
    initial,
    live = false,
}: {
    initial: VoiceState;
    live?: boolean;
}) {
    const [state, setState] = useState<VoiceState>(initial);

    return (
        <VoiceCaptureButton
            state={state}
            onToggle={() => live && setState(SEQUENCE[state])}
            onTypeInstead={() => undefined}
        />
    );
}

export function VoiceSection() {
    return (
        <Section
            id="voice-capture"
            title="Voice capture button"
            note="Five states: idle, listening, transcribing, error and permission denied. The first pair is clickable and steps through the states; there is no microphone behind it yet."
        >
            <Bilingual>
                <VoiceDemo initial="idle" live />
            </Bilingual>
            {(['listening', 'transcribing', 'error', 'denied'] as const).map(
                (state) => (
                    <div key={state} className="flex flex-col gap-3">
                        <Caption>{state}</Caption>
                        <Bilingual padded={false}>
                            <VoiceDemo initial={state} />
                        </Bilingual>
                    </div>
                ),
            )}
        </Section>
    );
}
