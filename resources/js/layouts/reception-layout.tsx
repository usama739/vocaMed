import { router, usePage } from '@inertiajs/react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    forcedStateFromUrl,
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
import { useData } from '@/hooks/use-data';
import { useShortcut } from '@/hooks/use-shortcut';
import { useT } from '@/i18n/scope';
import { startDemoActivity, type Appointment } from '@/lib/data';

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
    const { component, url } = usePage();
    const { t } = useT();
    const source = useData();
    const page = PAGES[component] ?? PAGES['reception/today'];

    const [epoch, setEpoch] = useState(0);
    const [online, setOnline] = useState(() =>
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );
    const [panel, setPanel] = useState<PanelState>({
        open: false,
        reschedule: null,
    });

    const forced = useMemo(
        () =>
            typeof window === 'undefined'
                ? null
                : forcedStateFromUrl(
                      window.location.search,
                      window.location.hostname,
                  ),
        // The address can change with navigation (`url`), and `?state=` rides along with it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [url],
    );

    const refresh = useCallback(() => setEpoch((n) => n + 1), []);

    // Connection: show the banner while offline and reload every page's data when it returns.
    useEffect(() => {
        const down = () => setOnline(false);
        const up = () => {
            setOnline(true);
            refresh();
        };

        window.addEventListener('offline', down);
        window.addEventListener('online', up);

        return () => {
            window.removeEventListener('offline', down);
            window.removeEventListener('online', up);
        };
    }, [refresh]);

    // The demo has no live server: messages advance and (with ?sim=1) other receptionists hold slots.
    useEffect(() => {
        if (import.meta.env.MODE === 'test') {
            return;
        }

        const sim = new URLSearchParams(window.location.search).get('sim');

        return startDemoActivity({ otherReceptionist: sim === '1' });
    }, []);

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

    const reconnecting = !online || forced === 'reconnecting';

    return (
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
    );
}
