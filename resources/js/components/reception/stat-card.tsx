import { useCountUp } from '@/hooks/use-count-up';
import { cn } from '@/lib/utils';

/** One number with its label. The number counts to its new value when it changes. */
export function StatCard({
    value,
    label,
    className,
    style,
}: {
    value: number;
    label: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const shown = useCountUp(value);

    return (
        <div
            style={style}
            className={cn(
                'flex flex-col gap-0.5 rounded-xl border border-line bg-white px-4 py-3.5 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift',
                className,
            )}
        >
            <span
                // Remounting on change replays the small bump, so a changed number is noticed.
                key={value}
                className="animate-bump text-[28px] leading-[1.2] font-bold text-ink motion-reduce:animate-none"
            >
                {shown}
            </span>
            <span className="text-label font-semibold text-copy">{label}</span>
        </div>
    );
}

/** The summary strip: equal cards that wrap on narrow screens. */
export function SummaryStrip({
    label,
    items,
}: {
    label: string;
    items: { key: string; label: string; value: number }[];
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"
        >
            {items.map((item, index) => (
                <StatCard
                    key={item.key}
                    value={item.value}
                    label={item.label}
                    className="animate-rise motion-reduce:animate-none"
                    // Staggered entrance: each card starts a little after the one before.
                    style={{ animationDelay: `${index * 50}ms` }}
                />
            ))}
        </div>
    );
}
