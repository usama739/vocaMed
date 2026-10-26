import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
    value: T;
    label: string;
    /** This option holds a message with unsaved text. */
    unsaved?: boolean;
    /** The option's own language, when it is written in another script than the page. */
    lang?: string;
};

/**
 * Two or three exclusive options in one pill (Channel, Message language). Pressed buttons, not a
 * radio group, as designed. An option with unsaved text carries a dot and a spoken note.
 */
export function Segmented<T extends string>({
    label,
    value,
    options,
    unsavedNote,
    onChange,
}: {
    label: string;
    value: T;
    options: SegmentedOption<T>[];
    unsavedNote: string;
    onChange: (value: T) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-col gap-1.5">
            <span
                aria-hidden="true"
                className="text-label font-semibold text-ink"
            >
                {label}
            </span>
            <div className="inline-flex self-start rounded-md border border-line bg-surface-subtle p-[3px]">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        lang={option.lang}
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'inline-flex min-h-11 min-w-[84px] items-center justify-center gap-2 rounded-[8px] px-3.5 text-label font-semibold transition-colors',
                            value === option.value
                                ? 'bg-white text-ink shadow-[0_1px_2px_rgba(7,20,55,0.12)]'
                                : 'text-ink-soft hover:bg-surface-hover',
                        )}
                    >
                        {option.label}
                        {option.unsaved && (
                            <>
                                <span
                                    aria-hidden="true"
                                    className="size-2 rounded-full bg-warning-accent"
                                />{' '}
                                <span className="sr-only">{unsavedNote}</span>
                            </>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
