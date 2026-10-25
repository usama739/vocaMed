import { Head } from '@inertiajs/react';
import { LandingPage } from '@/components/landing/landing-page';
import { useT } from '@/i18n/scope';

export default function Welcome() {
    const { t } = useT();

    return (
        <>
            <Head title={t('landing.hero.title')}>
                <meta name="description" content={t('landing.hero.sub')} />
            </Head>
            <LandingPage />
        </>
    );
}
