import { router, usePage } from '@inertiajs/react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
    ReceptionRuntimeContext,
    type ReceptionRuntime,
} from '@/components/reception/runtime';
import {
    BookingPanel,
    type BookingPanelInitial,
} from '@/components/vocamed/booking-panel';
import { ClinicShell } from '@/components/vocamed/clinic-shell';
import { ReconnectingBanner } from '@/components/vocamed/states';
import type { Crumb } from '@/components/vocamed/top-bar';
import { DataSourceProvider } from '@/hooks/use-data';
import { useStaffRuntime } from '@/hooks/use-staff-runtime';
import { useShortcut } from '@/hooks/use-shortcut';
import { useT } from '@/i18n/scope';
import { getRoleDataSource, type Appointment } from '@/lib/data';

type PageKey = {
    active: string;
    /** Breadcrumbs after "Receptionist". The last is the page itself. */
    trail: { label: string; href?: string }[];
};

/** One layout for every `reception/*` page, so the shell and booking panel survive navigation. */
const PAGES: Record<string, PageKey> = {
    'reception/today': {
        active: 'today',
        trail: [{ label: 'nav.today' }],
    },
    'reception/appointments': {
        active: 'appointments',
        trail: [{ label: 'nav.appointments' }],
    },
    'reception/appointment': {
        active: 'appointments',
        trail: [
            { label: 'nav.appointments', href: '/reception/appointments' },
            { label: 'reception.detail.title' },
        ],
    },
    'reception/calendar': {
        active: 'calendar',
        trail: [{ label: 'nav.calendar' }],
    },
    'reception/patients': {
        active: 'patients',
        trail: [{ label: 'nav.patients' }],
    },
    'reception/patient': {
        active: 'patients',
        trail: [
            { label: 'nav.patients', href: '/reception/patients' },
            { label: 'reception.patient.title' },
        ],
    },
    'reception/notifications': {
        active: 'notifications',
        trail: [{ label: 'nav.notifications' }],
    },
};

type PanelState = {
    open: boolean;
    prefill?: BookingPanelInitial;
    reschedule: Appointment | null;
};

export default function ReceptionLayout({ children }: { children: ReactNode }) {
    const { component } = usePage();
    const { t } = useT();
    const source = getRoleDataSource('receptionist');
    const page = PAGES[component] ?? PAGES['reception/today'];

    const [panel, setPanel] = useState<PanelState>({
        open: false,
        reschedule: null,
    });

    const { forced, epoch, refresh, reconnecting } = useStaffRuntime();

    const openBooking = useCallback(
        (prefill?: BookingPanelInitial) =>
            setPanel({ open: true, prefill, reschedule: null }),
        [],
    );
    const openVoice = useCallback(
        () =>
            setPanel({
                open: true,
                prefill: { tab: 'voice', phase: 'listening' },
                reschedule: null,
            }),
        [],
    );
    const openReschedule = useCallback(
        (appointment: Appointment) =>
            setPanel({ open: true, reschedule: appointment }),
        [],
    );

    useShortcut('m', openVoice, !panel.open);

    const runtime = useMemo<ReceptionRuntime>(
        () => ({
            forced,
            epoch,
            refresh,
            openBooking,
            openVoice,
            openReschedule,
        }),
        [forced, epoch, refresh, openBooking, openVoice, openReschedule],
    );

    const crumbs: Crumb[] = [
        { label: t('reception.crumb'), href: '/reception' },
        ...page.trail.map((item) => ({
            label: t(item.label as never),
            href: item.href,
        })),
    ];

    return (
        <DataSourceProvider source={source}>
            <ReceptionRuntimeContext.Provider value={runtime}>
                <ClinicShell
                    role="receptionist"
                    active={page.active}
                    crumbs={crumbs}
                    user={{ name: t('shell.userName') }}
                    onNewBooking={() => openBooking()}
                    onSearch={(query) =>
                        router.visit(
                            `/reception/patients?q=${encodeURIComponent(query)}`,
                        )
                    }
                    banner={reconnecting ? <ReconnectingBanner /> : undefined}
                >
                    {children}
                </ClinicShell>

                <BookingPanel
                    open={panel.open}
                    onOpenChange={(open) => setPanel((p) => ({ ...p, open }))}
                    source={source}
                    prefill={panel.prefill}
                    reschedule={panel.reschedule}
                    onBooked={refresh}
                />
            </ReceptionRuntimeContext.Provider>
        </DataSourceProvider>
    );
}
