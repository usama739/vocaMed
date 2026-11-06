import { Menu } from 'lucide-react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
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
    badges,
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
    /** Counts beside sidebar items, by nav key. */
    badges?: Record<string, number>;
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
    const receptionist = role === 'receptionist';

    // Staff screens use the compact scale on a desktop with a mouse (see `data-density` in app.css). It is set on <html> so the
    // dialogs and the booking slide-over, which render outside this shell, follow it too. Set before paint so nothing jumps.
    useLayoutEffect(() => {
        if (embedded) {
            return;
        }

        const root = document.documentElement;
        root.dataset.density = 'compact';

        return () => {
            delete root.dataset.density;
        };
    }, [embedded]);

    useShortcut(
        'n',
        () => onNewBooking?.(),
        receptionist && !embedded && !!onNewBooking,
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
                    '-my-3 -ms-3 hidden w-68 shrink-0 lg:block',
                    embedded
                        ? 'h-[calc(100%+1.5rem)]'
                        : 'lg:sticky lg:top-0 lg:h-screen',
                )}
            >
                <RoleSidebar
                    role={role}
                    active={active}
                    clinicName={clinicName}
                    badges={badges}
                />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-line bg-white shadow-soft">
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
                        badges={badges}
                        onNavigate={() => setMenuOpen(false)}
                    />
                </SheetContent>
            </Sheet>
        </div>
    );
}
