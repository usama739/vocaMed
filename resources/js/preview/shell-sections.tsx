import { useMemo, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    BookingPanel,
    BookingPanelCard,
} from '@/components/vocamed/booking-panel';
import type { BookingPanelInitial } from '@/components/vocamed/booking-panel';
import { ClinicShell } from '@/components/vocamed/clinic-shell';
import { NAV, type NavEntry } from '@/components/vocamed/nav-config';
import { ReconnectingBanner } from '@/components/vocamed/states';
import { LocaleScope, useT } from '@/i18n/scope';
import { DEMO_CLINIC_ID, getDataSource, type Role } from '@/lib/data';
import { Bilingual, Caption, Section } from '@/preview/shared';

/** The preview's links go nowhere; keep clicks inside the frame so the page does not navigate. */
function stopNavigation(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('a[href]')) {
        event.preventDefault();
        event.stopPropagation();
    }
}

function ShellFrame({
    role,
    active,
    tablet = false,
    reconnecting = false,
}: {
    role: Role;
    active: string;
    tablet?: boolean;
    reconnecting?: boolean;
}) {
    const { t } = useT();
    const home = NAV[role].find(
        (e): e is Extract<NavEntry, { type: 'item' }> => e.type === 'item',
    );
    const current = NAV[role].find(
        (e): e is Extract<NavEntry, { type: 'item' }> =>
            e.type === 'item' && e.key === active,
    );
    const [booking, setBooking] = useState(false);
    const source = useMemo(
        () => getDataSource(DEMO_CLINIC_ID, 'u_preview_shell'),
        [],
    );

    return (
        <div
            onClickCapture={stopNavigation}
            className={tablet ? 'mx-auto h-[520px] max-w-[820px]' : 'h-[560px]'}
        >
            <ClinicShell
                embedded
                role={role}
                active={active}
                crumbs={[
                    ...(role === 'doctor' || current === home
                        ? []
                        : home
                          ? [{ label: t(home.label), href: home.href }]
                          : []),
                    { label: current ? t(current.label) : '' },
                ]}
                user={{ name: t('shell.userName') }}
                onNewBooking={() => setBooking(true)}
                onLocaleChange={() => undefined}
                onSignOut={() => undefined}
                banner={reconnecting ? <ReconnectingBanner /> : undefined}
            >
                <h1 className="text-heading font-bold text-ink">
                    {current ? t(current.label) : ''}
                </h1>
                <p className="mt-2 text-control">{t('shell.clinicName')}</p>
            </ClinicShell>
            <BookingPanel
                open={booking}
                onOpenChange={setBooking}
                source={source}
            />
        </div>
    );
}

export function ShellSection() {
    return (
        <Section
            id="app-shell"
            title="App shell"
            note="Role-scoped sidebar, top bar with breadcrumbs, language switch and user menu, and the white content card. The clinic name and user name are bracketed placeholders until the server supplies them. Below 1024px the sidebar becomes a drawer behind the menu button. The New booking button (receptionist) opens the real booking panel."
        >
            {(
                [
                    ['receptionist', 'today', 'Receptionist'],
                    ['clinic_admin', 'doctors', 'Clinic Admin'],
                    ['doctor', 'schedule', 'Doctor'],
                ] as const
            ).map(([role, active, label]) => (
                <div key={role} className="flex flex-col gap-3">
                    <Caption>{label}</Caption>
                    <Bilingual padded={false} className="2xl:grid-cols-1">
                        <ShellFrame role={role} active={active} />
                    </Bilingual>
                </div>
            ))}

            <div className="flex flex-col gap-3">
                <Caption>
                    Tablet width (menu button and drawer) · with the
                    reconnecting banner
                </Caption>
                <Bilingual padded={false}>
                    <ShellFrame
                        role="receptionist"
                        active="appointments"
                        tablet
                        reconnecting
                    />
                </Bilingual>
            </div>
        </Section>
    );
}

const PANEL_STATES: {
    key: string;
    title: string;
    initial: BookingPanelInitial;
}[] = [
    {
        key: 'idle',
        title: 'Voice · idle',
        initial: { tab: 'voice', phase: 'idle' },
    },
    {
        key: 'listening',
        title: 'Voice · listening',
        initial: { tab: 'voice', phase: 'listening' },
    },
    {
        key: 'transcribing',
        title: 'Voice · transcribing',
        initial: { tab: 'voice', phase: 'transcribing' },
    },
    {
        key: 'error',
        title: 'Voice · could not hear (typed fallback below)',
        initial: { tab: 'voice', phase: 'error' },
    },
    {
        key: 'denied',
        title: 'Voice · microphone blocked',
        initial: { tab: 'voice', phase: 'denied' },
    },
    {
        key: 'review',
        title: 'Voice · review card with slot hold and low-confidence field',
        initial: { tab: 'voice', phase: 'review' },
    },
    {
        key: 'taken',
        title: 'Voice · slot taken, three nearest alternatives',
        initial: { tab: 'voice', phase: 'taken' },
    },
    { key: 'manual', title: 'Manual tab', initial: { tab: 'manual' } },
    { key: 'done', title: 'Booked', initial: { done: true } },
];

function PanelState({
    index,
    initial,
}: {
    index: number;
    initial: BookingPanelInitial;
}) {
    // Each card gets its own acting user so their slot holds do not release each other's.
    const source = useMemo(
        () => getDataSource(DEMO_CLINIC_ID, `u_preview_${index}`),
        [index],
    );

    return <BookingPanelCard source={source} initial={initial} />;
}

export function BookingSection() {
    const [open, setOpen] = useState<'en' | 'ur' | null>(null);
    const source = useMemo(
        () => getDataSource(DEMO_CLINIC_ID, 'u_preview_live'),
        [],
    );

    return (
        <Section
            id="booking-panel"
            title="Booking panel"
            note="Voice and Manual tabs over the typed data layer: real slots, a 2-minute hold with countdown, and conflict handling with the three nearest alternatives. Voice interpretation is a stand-in that builds a draft from the sample data until the speech service exists. Press M with the panel open to start voice."
        >
            <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setOpen('en')}>
                    Open slide-over (English)
                </Button>
                <Button variant="outline" onClick={() => setOpen('ur')}>
                    Open slide-over (Urdu)
                </Button>
            </div>
            {(['en', 'ur'] as const).map((locale) => (
                <LocaleScope key={locale} locale={locale}>
                    <BookingPanel
                        open={open === locale}
                        onOpenChange={(next) => setOpen(next ? locale : null)}
                        source={source}
                    />
                </LocaleScope>
            ))}

            {PANEL_STATES.map((state, index) => (
                <div key={state.key} className="flex flex-col gap-3">
                    <Caption>{state.title}</Caption>
                    <Bilingual padded={false}>
                        <PanelState index={index} initial={state.initial} />
                    </Bilingual>
                </div>
            ))}
        </Section>
    );
}
