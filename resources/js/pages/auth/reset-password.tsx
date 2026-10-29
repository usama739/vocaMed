import { Head } from '@inertiajs/react';
import { ResetPage } from '@/components/auth/reset-page';
import { useT } from '@/i18n/scope';

export default function ResetPassword({
    token,
    email,
}: {
    token: string;
    email?: string | null;
}) {
    const { t } = useT();

    return (
        <>
            <Head title={t('auth.reset.title')} />
            <ResetPage token={token} email={email ?? ''} />
        </>
    );
}
