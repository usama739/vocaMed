import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Placeholders } from '@/components/public/placeholders';
import { PublicLayout } from '@/components/public/public-layout';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

const IDS = {
    privacy: ['stored', 'voice', 'messages', 'vendors', 'access', 'requests'],
    terms: ['use', 'accounts', 'clinic', 'plans', 'liability', 'changes'],
} as const;

type Doc = keyof typeof IDS;
const DOCS: Doc[] = ['privacy', 'terms'];

const initialDoc = (): Doc =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('doc') === 'terms'
        ? 'terms'
        : 'privacy';

/** Which section is being read: the last one whose top has passed the upper part of the screen. */
function useScrollSpy(ids: readonly string[]) {
    const [seen, setSeen] = useState<string | null>(null);

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') {
            return;
        }

        const nodes = ids
            .map((id) => document.getElementById(id))
            .filter((node): node is HTMLElement => node !== null);
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting);

                if (visible.length > 0) {
                    setSeen(visible[0].target.id);
                }
            },
            { rootMargin: '-15% 0px -70% 0px' },
        );

        nodes.forEach((node) => observer.observe(node));

        return () => observer.disconnect();
    }, [ids]);

    return seen !== null && ids.includes(seen) ? seen : ids[0];
}

/** Privacy / Terms switch with a white pill that slides between the two. */
function DocTabs({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
    const { t, isRtl } = useT();
    const refs = useRef<Record<Doc, HTMLButtonElement | null>>({
        privacy: null,
        terms: null,
    });

    const onKeyDown = (event: KeyboardEvent) => {
        const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
        const back = isRtl ? 'ArrowRight' : 'ArrowLeft';

        if (event.key !== forward && event.key !== back) {
            return;
        }

        event.preventDefault();
        const next = DOCS[(DOCS.indexOf(doc) + 1) % DOCS.length];
        onChange(next);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="group"
            aria-label={t('privacy.document')}
            onKeyDown={onKeyDown}
            className="relative inline-grid grid-cols-2 self-start rounded-xl border border-line bg-surface-subtle p-1"
        >
            <span
                aria-hidden="true"
                className={cn(
                    'absolute inset-y-1 start-1 w-[calc(50%-4px)] rounded-[9px] bg-white shadow-xs transition-transform duration-300 ease-out-soft',
                    doc === 'terms' && 'translate-x-full rtl:-translate-x-full',
                )}
            />
            {DOCS.map((key) => (
                <button
                    key={key}
                    ref={(node) => {
                        refs.current[key] = node;
                    }}
                    type="button"
                    aria-pressed={doc === key}
                    onClick={() => onChange(key)}
                    className={cn(
                        'relative z-10 min-h-11 rounded-[9px] px-5 text-control font-semibold transition-colors',
                        doc === key ? 'text-ink' : 'text-copy hover:text-ink',
                    )}
                >
                    {t(key === 'privacy' ? 'privacy.tabPrivacy' : 'privacy.tabTerms')}
                </button>
            ))}
        </div>
    );
}

/** A7. Privacy and terms: two documents, a sticky "on this page" list and the article. */
export function PrivacyPage() {
    const { t } = useT();
    const [doc, setDoc] = useState<Doc>(initialDoc);
    const ids = IDS[doc];
    const active = useScrollSpy(ids);
    const activeIndex = ids.indexOf(active as never);

    const choose = (next: Doc) => {
        setDoc(next);
        const url = new URL(window.location.href);

        if (next === 'terms') {
            url.searchParams.set('doc', 'terms');
        } else {
            url.searchParams.delete('doc');
        }

        url.hash = '';
        window.history.replaceState(window.history.state, '', url);
        window.scrollTo({ top: 0 });
    };

    const heading = (id: string) =>
        t(`privacy.${doc}.${id as never}.h` as never) as string;
    const body = (id: string) =>
        t(`privacy.${doc}.${id as never}.p` as never) as string;

    return (
        <PublicLayout variant="marketing">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-9 px-6 pt-14 pb-[88px]">
                <div className="flex max-w-[720px] animate-rise flex-col gap-3">
                    <h1 className="text-display font-bold text-ink">
                        {t('privacy.title')}
                    </h1>
                    <p className="text-lead">{t('privacy.intro')}</p>
                    <p className="text-label text-subtle">
                        <Placeholders>{t('privacy.updated')}</Placeholders>
                    </p>
                </div>

                <DocTabs doc={doc} onChange={choose} />

                <div className="flex flex-wrap items-start gap-12">
                    <nav
                        aria-label={t('privacy.onPage')}
                        className="flex min-w-0 flex-[0_1_260px] flex-col gap-1 rounded-xl border border-line bg-surface-subtle p-4 lg:sticky lg:top-24"
                    >
                        <span className="px-2 pb-1.5 text-small font-semibold tracking-[0.04em] text-subtle uppercase">
                            {t('privacy.onPage')}
                        </span>
                        <ul className="relative flex flex-col gap-1">
                            <span
                                aria-hidden="true"
                                className="absolute inset-x-0 top-0 h-11 rounded-sm bg-white shadow-xs transition-transform duration-300 ease-out-soft"
                                style={{
                                    transform: `translateY(${Math.max(activeIndex, 0) * 48}px)`,
                                }}
                            />
                            {ids.map((id) => (
                                <li key={id} className="relative z-10">
                                    <a
                                        href={`#${id}`}
                                        aria-current={id === active ? 'true' : undefined}
                                        className={cn(
                                            'flex min-h-11 items-center rounded-sm px-2 text-control transition-colors',
                                            id === active
                                                ? 'font-semibold text-ink'
                                                : 'font-medium text-copy hover:text-ink',
                                        )}
                                    >
                                        {heading(id)}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <article
                        key={doc}
                        className="flex min-w-0 max-w-[760px] flex-[1_1_520px] animate-fade flex-col gap-9"
                    >
                        {ids.map((id) => (
                            <section
                                key={id}
                                id={id}
                                className="flex scroll-mt-24 flex-col gap-2.5"
                            >
                                <h2 className="text-[1.5rem] leading-[1.3] font-bold tracking-[-0.02em] text-ink rtl:tracking-normal">
                                    {heading(id)}
                                </h2>
                                <p className="text-body text-pretty">
                                    <Placeholders>{body(id)}</Placeholders>
                                </p>
                            </section>
                        ))}
                    </article>
                </div>
            </div>
        </PublicLayout>
    );
}
