import { Link } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useId, type Ref } from 'react';
import { BrandMark } from '@/components/vocamed/brand-mark';
import { NAV, ROLE_HOME } from '@/components/vocamed/nav-config';
import { useT } from '@/i18n/scope';
import type { Role } from '@/lib/data';
import { cn } from '@/lib/utils';

export function RoleSidebar({
    role,
    active,
    clinicName,
    searchRef,
    onNavigate,
    className,
}: {
    role: Role;
    /** The `key` of the current nav item (see nav-config). */
    active?: string;
    /** Defaults to the bracketed placeholder until the clinic name comes from the server. */
    clinicName?: string;
    searchRef?: Ref<HTMLInputElement>;
    /** Called after a link is chosen; the mobile drawer uses it to close itself. */
    onNavigate?: () => void;
    className?: string;
}) {
    const { t } = useT();
    const searchId = useId();

    return (
        <nav
            aria-label={t('shell.mainMenu')}
            className={cn(
                'flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto bg-sidebar px-3 py-4',
                className,
            )}
        >
            <Link
                href={ROLE_HOME[role]}
                onClick={onNavigate}
                className="flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5"
            >
                <BrandMark />
                <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="truncate text-control font-bold text-ink">
                        {clinicName ?? t('shell.clinicName')}
                    </span>
                    <span className="text-small text-subtle">
                        {t(`roles.${role}`)}
                    </span>
                </span>
            </Link>

            <div className="relative">
                <label htmlFor={searchId} className="sr-only">
                    {t('shell.searchMenu')}
                </label>
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 top-3.5 size-[18px] text-subtle"
                />
                <input
                    id={searchId}
                    ref={searchRef}
                    type="search"
                    placeholder={t('shell.searchMenu')}
                    className="h-11 w-full rounded-md border border-line bg-white ps-10 pe-10 text-control text-ink placeholder:text-subtle"
                />
                <kbd
                    aria-hidden="true"
                    className="pointer-events-none absolute end-2.5 top-2.5 inline-flex h-6 min-w-[22px] items-center justify-center rounded-xs border border-line-strong bg-surface-subtle px-1.5 font-sans text-caption font-semibold text-subtle"
                >
                    /
                </kbd>
            </div>

            <ul className="flex flex-col gap-1">
                {NAV[role].map((entry) => {
                    if (entry.type === 'section') {
                        return (
                            <li
                                key={entry.label}
                                className="px-3 pt-3.5 pb-1.5 text-caption font-semibold tracking-[0.04em] text-subtle uppercase"
                            >
                                {t(entry.label)}
                            </li>
                        );
                    }

                    const on = entry.key === active;
                    const Icon = entry.icon;

                    return (
                        <li key={entry.key}>
                            <Link
                                href={entry.href}
                                onClick={onNavigate}
                                aria-current={on ? 'page' : undefined}
                                className={cn(
                                    'flex min-h-11 items-center gap-3 rounded-md border px-3 text-control',
                                    on
                                        ? 'border-line bg-sidebar-accent font-semibold text-ink shadow-xs'
                                        : 'border-transparent font-medium text-sidebar-foreground hover:bg-line-soft',
                                )}
                            >
                                <Icon
                                    aria-hidden="true"
                                    className={cn(
                                        'size-5 shrink-0',
                                        on ? 'text-brand' : 'text-subtle',
                                    )}
                                />
                                <span>{t(entry.label)}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
