import { Head } from '@inertiajs/react';
import { PrivacyPage } from '@/components/public/privacy-page';
import { useT } from '@/i18n/scope';

export default function Privacy() {
    const { t } = useT();

    return (
        <>
            <Head title={t('privacy.title')} />
            <PrivacyPage />
        </>
    );
}
