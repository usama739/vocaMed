import type { ReactNode } from 'react';
import { initialsOf } from '@/components/reception/format';
import { ClinicShell } from '@/components/vocamed/clinic-shell';
import { ReconnectingBanner } from '@/components/vocamed/states';
import { AccountSourceProvider } from '@/hooks/use-account';
import { useSessionRole, useSessionUser } from '@/hooks/use-session-user';
import { useStaffRuntime } from '@/hooks/use-staff-runtime';
import { useT } from '@/i18n/scope';
import { getAccountSource } from '@/lib/data';

/**
 * The shell for `/account`, shared by every staff role: the sidebar and top bar of the signed-in
 * person's own area, with no sidebar item highlighted. Which area that is comes from the session
 * (the demo remembers the area last visited).
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
    const { t } = useT();
    const role = useSessionRole();
    const me = useSessionUser(role);
    const { reconnecting } = useStaffRuntime();

    return (
        <AccountSourceProvider source={getAccountSource(role)}>
            <ClinicShell
                role={role}
                crumbs={[{ label: t('account.title') }]}
                user={{ name: me.name, initials: initialsOf(me.name) }}
                banner={reconnecting ? <ReconnectingBanner /> : undefined}
            >
                {children}
            </ClinicShell>
        </AccountSourceProvider>
    );
}
