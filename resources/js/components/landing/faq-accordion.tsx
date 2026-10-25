import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

export type FaqItem = { id: string; q: string; a: string };

/**
 * One question open at a time (the first on load). Each question is a heading containing a
 * button; the answer slides open by animating its grid row from 0fr to 1fr, and is inert
 * while closed so keyboard focus can never land inside hidden text.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
    const base = useId();
    const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);

    return (
        <div className="border-t border-line">
            {items.map((item) => {
                const isOpen = open === item.id;
                const buttonId = `${base}-${item.id}-q`;
                const panelId = `${base}-${item.id}-a`;

                return (
                    <div key={item.id} className="border-b border-line">
                        <h3>
                            <button
                                id={buttonId}
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpen(isOpen ? null : item.id)}
                                className="group flex min-h-16 w-full items-center justify-between gap-4 py-3.5 text-start text-lead font-semibold text-ink transition-colors hover:text-brand-hover"
                            >
                                <span>{item.q}</span>
                                <ChevronDown
                                    aria-hidden="true"
                                    className={cn(
                                        'size-[22px] shrink-0 text-subtle transition-transform duration-300 group-hover:text-brand',
                                        isOpen && 'rotate-180 text-brand',
                                    )}
                                    strokeWidth={2.2}
                                />
                            </button>
                        </h3>
                        <div
                            id={panelId}
                            role="region"
                            aria-labelledby={buttonId}
                            inert={!isOpen}
                            className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-300 ease-out-soft',
                                isOpen
                                    ? 'grid-rows-[1fr] opacity-100'
                                    : 'grid-rows-[0fr] opacity-0',
                            )}
                        >
                            <div className="overflow-hidden">
                                <p className="max-w-[680px] pb-5 text-body text-pretty">
                                    {item.a}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
