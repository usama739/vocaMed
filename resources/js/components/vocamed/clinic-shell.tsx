import { Menu } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { RoleSidebar } from '@/components/vocamed/role-sidebar';
import {
    TopBar,
    type Crumb,
    type ShellUser,
} from '@/components/vocamed/top-bar';
import { useShortcut } from '@/hooks/use-shortcut';
import type { Locale } from '@/i18n/locales';
import { useT } from '@/i18n/scope';
import type { Role } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * The app shell every signed-in page sits in: role-scoped sidebar, top bar with breadcrumbs,
 * language switch and user menu, and a white content card.
 * From `lg` up the sidebar is fixed beside the content; below that it opens as a drawer
 * (tablets at the front desk).
 */
export function ClinicShell({
    role,
    active,
    crumbs,
    user,
    clinicName,
    onNewBooking,
    onSearch,
    onLocaleChange,
    onSignOut,
    banner,
    embedded = false,
    children,
}: {
    role: Role;
    active?: string;
    crumbs: Crumb[];
    user: ShellUser;
    clinicName?: string;
    onNewBooking?: () => void;
    /** Sidebar quick search (Enter): the receptionist console opens Patients with the text. */
    onSearch?: (query: string) => void;
    onLocaleChange?: (locale: Locale) => void;
    onSignOut?: () => void;
    /** Full-width strip above the page content, e.g. the reconnecting banner. */
    banner?: ReactNode;
    /** Fill a fixed-height frame instead of the viewport, with no global shortcuts (previews). */
    embedded?: boolean;
    children: ReactNode;
}) {
    const { t, locale, dir } = useT();
    const [menuOpen, setMenuOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const receptionist = role === 'receptionist';

    useShortcut(
        'n',
        () => onNewBooking?.(),
        receptionist && !embedded && !!onNewBooking,
    );
    useShortcut(
        '/',
        () => searchRef.current?.focus(),
        receptionist && !embedded,
    );

    return (
        <div
            className={cn(
                'flex gap-3 bg-canvas p-3 text-copy',
                embedded ? 'h-full min-h-0' : 'min-h-screen',
            )}
        >
            <a
                href="#main-content"
                className="sr-only rounded-md bg-white px-4 py-3 font-semibold text-ink focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50"
            >
                {t('shell.skip')}
            </a>

            <aside
                className={cn(
                    '-my-3 -ms-3 hidden w-[272px] shrink-0 lg:block',
                    embedded
                        ? 'h-[calc(100%+1.5rem)]'
                        : 'lg:sticky lg:top-0 lg:h-screen',
                )}
            >
                <RoleSidebar
                    role={role}
                    active={active}
                    clinicName={clinicName}
                    searchRef={searchRef}
                    onSearch={onSearch}
                />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white">
                <TopBar
                    role={role}
                    crumbs={crumbs}
                    user={user}
                    onNewBooking={onNewBooking}
                    onLocaleChange={onLocaleChange}
                    onSignOut={onSignOut}
                    leading={
                        <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0 lg:hidden"
                            aria-label={t('shell.openMenu')}
                            onClick={() => setMenuOpen(true)}
                        >
                            <Menu aria-hidden="true" />
                        </Button>
                    }
                />
                {banner}
                <main
                    id="main-content"
                    tabIndex={-1}
                    className="min-h-0 flex-1 overflow-y-auto p-7 outline-none"
                >
                    {children}
                </main>
            </div>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetContent
                    side="left"
                    dir={dir}
                    lang={locale}
                    aria-describedby={undefined}
                    className="w-[290px] max-w-[85vw] gap-0 bg-sidebar p-0 sm:max-w-[290px]"
                >
                    <SheetTitle className="sr-only">
                        {t('shell.mainMenu')}
                    </SheetTitle>
                    <RoleSidebar
                        role={role}
                        active={active}
                        clinicName={clinicName}
                        onSearch={onSearch}
                        onNavigate={() => setMenuOpen(false)}
                    />
                </SheetContent>
            </Sheet>
        </div>
    );
}
