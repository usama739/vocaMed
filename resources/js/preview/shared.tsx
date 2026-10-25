import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/locales';
import { LocaleScope, useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

export function Section({
    id,
    title,
    note,
    children,
}: {
    id: string;
    title: string;
    note?: string;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={`${id}-title`}
            className="scroll-mt-24"
        >
            <h2 id={`${id}-title`} className="text-heading font-bold text-ink">
                {title}
            </h2>
            {note && <p className="mt-1.5 max-w-3xl text-control">{note}</p>}
            <div className="mt-6 flex flex-col gap-8">{children}</div>
        </section>
    );
}

/** A small caption above a demo, in English (the page chrome is a developer view). */
export function Caption({ children }: { children: ReactNode }) {
    return <h3 className="text-label font-semibold text-ink">{children}</h3>;
}

const LABELS: Record<Locale, string> = {
    en: 'English · left to right',
    ur: 'Urdu · right to left',
};

/**
 * Renders the same demo twice, once per language, each in a fixed-locale scope. Everything
 * inside translates and mirrors on its own, with no page language switch needed.
 */
export function Bilingual({
    children,
    className,
    padded = true,
}: {
    children: ReactNode;
    className?: string;
    padded?: boolean;
}) {
    return (
        <div className={cn('grid gap-6 xl:grid-cols-2', className)}>
            {(['en', 'ur'] as const).map((locale) => (
                <div key={locale} className="min-w-0">
                    <p className="mb-2 text-small font-semibold text-subtle">
                        {LABELS[locale]}
                    </p>
                    <LocaleScope
                        locale={locale}
                        className={cn(
                            'rounded-2xl border border-line bg-white',
                            padded && 'p-5',
                        )}
                    >
                        {children}
                    </LocaleScope>
                </div>
            ))}
        </div>
    );
}

/** Marks demo content as invented, in the demo's own language. */
export function SampleLabel() {
    const { t } = useT();

    return <p className="mt-3 text-small text-subtle">{t('common.sample')}</p>;
}
