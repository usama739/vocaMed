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
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';
import { getRoleDataSource } from '@/lib/data';

const PAGES: Record<
    string,
    { active: string; label: string; trail?: { label: string; href: string } }
> = {
    'doctor/overview': { active: 'overview', label: 'nav.overview' },
    'doctor/schedule': { active: 'schedule', label: 'nav.schedule' },
    'doctor/availability': {
        active: 'availability',
        label: 'nav.availability',
    },
    'doctor/requests': { active: 'requests', label: 'nav.requests' },
};

const noop = () => undefined;

/**
 * One layout for every `doctor/*` page. The shell, sidebar and the pending-requests badge stay in
 * place as the doctor moves between pages. The doctor has no booking panel, so the booking parts
 * of the shared runtime do nothing here.
 */
export default function DoctorLayout({ children }: { children: ReactNode }) {
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
        <DataSourceProvider source={getRoleDataSource('doctor')}>
            <ReceptionRuntimeContext.Provider value={runtime}>
                <DoctorFrame reconnecting={reconnecting}>
                    {children}
                </DoctorFrame>
            </ReceptionRuntimeContext.Provider>
        </DataSourceProvider>
    );
}

function DoctorFrame({
    reconnecting,
    children,
}: {
    reconnecting: boolean;
    children: ReactNode;
}) {
    const { component } = usePage();
    const { t } = useT();
    const me = useSessionUser('doctor');
    const clinicName = useClinicName();
    const page = PAGES[component] ?? PAGES['doctor/overview'];
    // The sidebar badge is a view of its own (shared props with Inertia), refreshed with the page.
    const shell = useView('doctorShell', undefined, { refreshMs: 10_000 });

    const crumbs: Crumb[] = [
        { label: t('doctor.crumb'), href: '/doctor' },
        { label: t(page.label as never) },
    ];

    return (
        <ClinicShell
            role="doctor"
            active={page.active}
            crumbs={crumbs}
            user={{ name: me.name, initials: initialsOf(me.name) }}
            clinicName={clinicName}
            badges={{ requests: shell.data?.pendingRequests ?? 0 }}
            banner={reconnecting ? <ReconnectingBanner /> : undefined}
        >
            {children}
        </ClinicShell>
    );
}
