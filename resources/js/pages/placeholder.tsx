import { Head, Link } from '@inertiajs/react';
import { StatusPanel } from '@/components/public/auth-card';
import { AuthStage, PublicLayout } from '@/components/public/public-layout';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';
import type { Role } from '@/lib/data';

/**
 * Where a sign-in lands until the role areas are built (no access control yet).
 * Replaced by the real home pages in later modules.
 */
export default function Placeholder({ role }: { role: Role }) {
    const { t } = useT();
    const title = t('auth.placeholder.title', { role: t(`roles.${role}`) });

    return (
        <PublicLayout variant="auth">
            <Head title={title} />
            <AuthStage width={460}>
                <StatusPanel
                    tone="success"
                    title={title}
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/login">
                                {t('auth.common.backToSignIn')}
                            </Link>
                        </Button>
                    }
                >
                    <p>{t('auth.placeholder.text')}</p>
                </StatusPanel>
            </AuthStage>
        </PublicLayout>
    );
}
