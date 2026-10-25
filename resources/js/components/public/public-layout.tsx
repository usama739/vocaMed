import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/vocamed/brand-mark';
import { LanguageSwitch } from '@/components/vocamed/language-switch';
import { useScrolled } from '@/hooks/use-scrolled';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
    return (
        <Link
            href="/"
            aria-label="VocaMed"
            className={cn(
                'group inline-flex min-h-11 items-center gap-2.5 rounded-md text-ink',
                className,
            )}
        >
            <BrandMark className="size-8 rounded-[9px] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]" />
            <span
                lang="en"
                dir="ltr"
                className="font-sans text-title font-bold tracking-[-0.02em]"
            >
                VocaMed
            </span>
        </Link>
    );
}

export type PublicLink = { href: string; label: string };

/**
 * Shell for every signed-out page.
 * `marketing` (landing, privacy): full header with optional section links and Log in.
 * `auth` (sign-in flow): compact header over a quiet canvas.
 */
export function PublicLayout({
    variant,
    links = [],
    sticky = false,
    footer,
    children,
}: {
    variant: 'marketing' | 'auth';
    links?: PublicLink[];
    sticky?: boolean;
    footer?: ReactNode;
    children: ReactNode;
}) {
    const { t } = useT();
    const scrolled = useScrolled();
    const marketing = variant === 'marketing';

    return (
        <div
            className={cn(
                'flex min-h-dvh flex-col text-copy',
                marketing ? 'bg-white' : 'bg-surface-subtle',
            )}
        >
            <a
                href="#main-content"
                className="sr-only rounded-md bg-white px-4 py-3 font-semibold text-ink focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50"
            >
                {t('shell.skip')}
            </a>

            <header
                className={cn(
                    'z-40 transition-[box-shadow,background-color] duration-300',
                    marketing && 'border-b border-line bg-white',
                    sticky && 'sticky top-0',
                    sticky && scrolled && 'bg-white/90 shadow-menu backdrop-blur',
                )}
            >
                <div
                    className={cn(
                        'mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 transition-[padding] duration-300',
                        sticky && scrolled ? 'py-2' : 'py-3',
                    )}
                >
                    <Wordmark />

                    {links.length > 0 && (
                        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-2">
                            {links.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="relative inline-flex min-h-11 items-center px-3 text-control font-medium text-copy transition-colors hover:text-ink after:absolute after:inset-x-3 after:bottom-2 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-brand after:transition-transform after:duration-300 hover:after:scale-x-100 rtl:after:origin-right"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </nav>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <LanguageSwitch />
                        {marketing && (
                            <Button variant="outline" className="min-w-16" asChild>
                                <Link href="/login">{t('auth.common.logIn')}</Link>
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
                {children}
            </main>

            {footer}
        </div>
    );
}

export function AuthFooter() {
    const { t } = useT();

    return (
        <footer className="flex justify-center px-6 py-5">
            <Link
                href="/privacy"
                className="inline-flex min-h-11 items-center rounded-md px-2 text-label font-medium text-brand-hover transition-colors hover:text-brand-deep hover:underline"
            >
                {t('auth.common.privacy')}
            </Link>
        </footer>
    );
}

/**
 * The centred stage the sign-in pages sit on. `align="start"` suits taller forms
 * (sign-up) that should not float in the middle of the screen.
 */
export function AuthStage({
    width = 440,
    align = 'center',
    children,
}: {
    width?: 440 | 460 | 560;
    align?: 'center' | 'start';
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex flex-1 justify-center px-6 pt-6 pb-14',
                align === 'center' ? 'items-center' : 'items-start',
            )}
        >
            <div
                className="flex w-full flex-col gap-5"
                style={{ maxWidth: width }}
            >
                {children}
            </div>
        </div>
    );
}
