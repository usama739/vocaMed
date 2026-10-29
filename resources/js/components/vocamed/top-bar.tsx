import { Link, router } from '@inertiajs/react';
import {
    ArrowLeftRight,
    ChevronDown,
    ChevronRight,
    Plus,
    User,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { LanguageSwitch } from '@/components/vocamed/language-switch';
import { RECEPTION_CONSOLE_HREF } from '@/components/vocamed/nav-config';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/scope';
import type { Locale } from '@/i18n/locales';
import type { Role } from '@/lib/data';
import { logout } from '@/routes';

export type Crumb = { label: string; href?: string };

export type ShellUser = {
    name: string;
    /** Shown in the avatar; without it a person icon is used rather than a made-up monogram. */
    initials?: string;
};

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
    const { t } = useT();

    return (
        <nav aria-label={t('shell.breadcrumb')} className="min-w-0">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {crumbs.map((crumb, index) => {
                    const last = index === crumbs.length - 1;

                    return (
                        <Fragment key={`${crumb.label}-${index}`}>
                            {index > 0 && (
                                <li aria-hidden="true" className="flex">
                                    <ChevronRight className="size-4 text-subtle rtl:-scale-x-100" />
                                </li>
                            )}
                            <li className="flex">
                                {last || !crumb.href ? (
                                    <span
                                        aria-current={last ? 'page' : undefined}
                                        className="inline-flex min-h-11 items-center text-body font-bold text-ink"
                                    >
                                        {crumb.label}
                                    </span>
                                ) : (
                                    <Link
                                        href={crumb.href}
                                        className="inline-flex min-h-11 min-w-11 items-center justify-center text-control font-medium text-copy hover:text-ink"
                                    >
                                        {crumb.label}
                                    </Link>
                                )}
                            </li>
                        </Fragment>
                    );
                })}
            </ol>
        </nav>
    );
}

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd
            aria-hidden="true"
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-xs bg-white/20 px-1.5 font-sans text-caption font-bold"
        >
            {children}
        </kbd>
    );
}

export function UserMenu({
    role,
    user,
    onSignOut,
}: {
    role: Role;
    user: ShellUser;
    onSignOut?: () => void;
}) {
    const { t, locale, dir } = useT();

    return (
        <DropdownMenu dir={dir}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`${t('shell.userMenu')}: ${user.name}`}
                    className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-transparent py-0 ps-1.5 pe-2.5 hover:bg-surface-hover"
                >
                    <span
                        aria-hidden="true"
                        className="inline-flex size-9 items-center justify-center rounded-full bg-brand-wash text-label font-bold text-brand-deep"
                    >
                        {user.initials ?? <User className="size-[18px]" />}
                    </span>
                    <span className="flex flex-col items-start text-start leading-[1.3]">
                        <span className="text-label font-semibold text-ink">
                            {user.name}
                        </span>
                        <span className="text-small text-subtle">
                            {t(`roles.${role}`)}
                        </span>
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 text-subtle"
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                style={{ direction: dir }}
                lang={locale}
                className="w-56"
            >
                <DropdownMenuItem asChild>
                    <Link href="/account">{t('shell.account')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={onSignOut ?? (() => router.post(logout().url))}
                >
                    {t('shell.signOut')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function TopBar({
    role,
    crumbs,
    user,
    onNewBooking,
    onLocaleChange,
    onSignOut,
    leading,
}: {
    role: Role;
    crumbs: Crumb[];
    user: ShellUser;
    /** Receptionist only. Opens the booking panel over the current screen. */
    onNewBooking?: () => void;
    onLocaleChange?: (locale: Locale) => void;
    onSignOut?: () => void;
    /** The mobile menu button goes here. */
    leading?: ReactNode;
}) {
    const { t } = useT();

    return (
        <header className="relative z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-white px-6 py-3 shadow-bar">
            <div className="flex min-w-0 items-center gap-2">
                {leading}
                <Breadcrumbs crumbs={crumbs} />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
                {role === 'clinic_admin' && (
                    <Button variant="outline" asChild>
                        <Link href={RECEPTION_CONSOLE_HREF}>
                            <ArrowLeftRight aria-hidden="true" />
                            {t('shell.console')}
                        </Link>
                    </Button>
                )}
                {role === 'receptionist' && onNewBooking && (
                    <Button onClick={onNewBooking}>
                        <Plus aria-hidden="true" />
                        {t('shell.newBooking')}
                        <Kbd>N</Kbd>
                    </Button>
                )}
                <LanguageSwitch onChange={onLocaleChange} />
                <UserMenu role={role} user={user} onSignOut={onSignOut} />
            </div>
        </header>
    );
}
