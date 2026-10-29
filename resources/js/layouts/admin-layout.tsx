import { usePage } from '@inertiajs/react';
import { useMemo, type ReactNode } from 'react';
import {
    ReceptionRuntimeContext,
    type ReceptionRuntime,
} from '@/components/reception/runtime';
import { ClinicShell } from '@/components/vocamed/clinic-shell';
import { initialsOf } from '@/components/reception/format';
import { ReconnectingBanner } from '@/components/vocamed/states';
import type { Crumb } from '@/components/vocamed/top-bar';
import { DataSourceProvider } from '@/hooks/use-data';
import { useClinicName, useSessionUser } from '@/hooks/use-session-user';
import { useStaffRuntime } from '@/hooks/use-staff-runtime';
import { useT } from '@/i18n/scope';
import { getRoleDataSource } from '@/lib/data';

type PageKey = {
    active: string;
    /** Breadcrumbs after "Clinic admin". The last is the page itself. */
    trail: { label: string; href?: string }[];
};

const PAGES: Record<string, PageKey> = {
    'admin/overview': {
        active: 'overview',
        trail: [{ label: 'nav.overview' }],
    },
    'admin/doctors': { active: 'doctors', trail: [{ label: 'nav.doctors' }] },
    'admin/doctor': {
        active: 'doctors',
        trail: [
            { label: 'nav.doctors', href: '/admin/doctors' },
            { label: 'admin.doctor.crumb' },
        ],
    },
    'admin/staff': { active: 'staff', trail: [{ label: 'nav.staff' }] },
    'admin/services': {
        active: 'services',
        trail: [{ label: 'nav.services' }],
    },
    'admin/settings': {
        active: 'settings',
        trail: [{ label: 'nav.settings' }],
    },
    'admin/templates': {
        active: 'templates',
        trail: [{ label: 'nav.templates' }],
    },
    'admin/audit': { active: 'audit', trail: [{ label: 'nav.audit' }] },
};

const noop = () => undefined;

/**
 * One layout for every `admin/*` page: the shell and sidebar stay in place as the admin moves
 * between pages. The admin has no booking panel here (the top bar links to the Receptionist
 * Console), so the booking parts of the shared runtime do nothing.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
    const { forced, epoch, refresh, reconnecting } = useStaffRuntime();

    const runtime = useMemo<ReceptionRuntime>(
        () => ({
            forced,
            epoch,
            refresh,
            openBooking: noop,
            openVoice: noop,
            openReschedule: noop,
        }),
        [forced, epoch, refresh],
    );

    return (
        <DataSourceProvider source={getRoleDataSource('clinic_admin')}>
            <ReceptionRuntimeContext.Provider value={runtime}>
                <AdminFrame reconnecting={reconnecting}>{children}</AdminFrame>
            </ReceptionRuntimeContext.Provider>
        </DataSourceProvider>
    );
}

function AdminFrame({
    reconnecting,
    children,
}: {
    reconnecting: boolean;
    children: ReactNode;
}) {
    const { component } = usePage();
    const { t } = useT();
    const me = useSessionUser('clinic_admin');
    const clinicName = useClinicName();
    const page = PAGES[component] ?? PAGES['admin/overview'];

    const crumbs: Crumb[] = [
        { label: t('admin.crumb'), href: '/admin' },
        ...page.trail.map((item) => ({
            label: t(item.label as never),
            href: item.href,
        })),
    ];

    return (
        <ClinicShell
            role="clinic_admin"
            active={page.active}
            crumbs={crumbs}
            user={{ name: me.name, initials: initialsOf(me.name) }}
            clinicName={clinicName}
            banner={reconnecting ? <ReconnectingBanner /> : undefined}
        >
            {children}
        </ClinicShell>
    );
}
