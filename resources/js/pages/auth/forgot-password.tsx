import { Head } from '@inertiajs/react';
import { ForgotPage } from '@/components/auth/forgot-page';
import { useT } from '@/i18n/scope';

export default function ForgotPassword() {
    const { t } = useT();

    return (
        <>
            <Head title={t('auth.forgot.title')} />
            <ForgotPage />
        </>
    );
}
