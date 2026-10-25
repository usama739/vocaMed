import { Head } from '@inertiajs/react';
import { RegisterPage } from '@/components/auth/register-page';
import { useT } from '@/i18n/scope';

export default function Register() {
    const { t } = useT();

    return (
        <>
            <Head title={t('auth.register.title')} />
            <RegisterPage />
        </>
    );
}
