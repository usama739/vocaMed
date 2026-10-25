import { Head, router } from '@inertiajs/react';
import { LoginPage } from '@/components/auth/login-page';
import { ROLE_HOME } from '@/components/vocamed/nav-config';
import { useT } from '@/i18n/scope';

export default function Login() {
    const { t } = useT();

    return (
        <>
            <Head title={t('auth.login.title')} />
            <LoginPage onSignedIn={(role) => router.visit(ROLE_HOME[role])} />
        </>
    );
}
