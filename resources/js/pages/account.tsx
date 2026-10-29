import { Head } from '@inertiajs/react';
import { NotificationsCard } from '@/components/account/notifications-card';
import { PasswordCard } from '@/components/account/password-card';
import { ProfileCard } from '@/components/account/profile-card';
import { SessionsCard } from '@/components/account/sessions-card';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
} from '@/components/reception/page-parts';
import { useAccountView } from '@/hooks/use-account';
import { useT } from '@/i18n/scope';

/** F1: the signed-in person's own name, language, password, email choices and sessions. */
export default function Account() {
    const { t } = useT();
    const query = useAccountView();
    const view = query.data;

    return (
        <>
            <Head title={t('account.title')} />
            <PageBody className="max-w-[860px] gap-6">
                <PageHeader
                    title={t('account.title')}
                    lead={t('account.sub')}
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('account.loading')}
                        blocks={[250, 330, 270, 130]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && (
                    <>
                        <ProfileCard user={view.user} onSaved={query.reload} />
                        <PasswordCard onChanged={query.reload} />
                        <NotificationsCard initial={view.notifications} />
                        <SessionsCard onDone={query.reload} />
                    </>
                )}
            </PageBody>
        </>
    );
}
