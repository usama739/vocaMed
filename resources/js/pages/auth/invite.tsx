import { Head } from '@inertiajs/react';
import { InvitePage } from '@/components/auth/invite-page';
import { useT } from '@/i18n/scope';

export default function Invite({ token }: { token: string }) {
    const { t } = useT();

    return (
        <>
            <Head title={t('auth.invite.title')} />
            <InvitePage token={token} />
        </>
    );
}
