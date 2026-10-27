import { Head } from '@inertiajs/react';
import { Check, Link2Off, Loader2, Phone } from 'lucide-react';
import { useState } from 'react';
import { usePatientError } from '@/hooks/use-patient-error';
import { usePatientLinks } from '@/hooks/use-patient-links';
import { useT } from '@/i18n/scope';
import type { ExpiredLinkView } from '@/lib/data';
import { nationalPhone } from './format';
import { Notice } from './notice';
import { PatientButton } from './patient-button';
import { PatientShell } from './patient-shell';

/**
 * "This link has expired". It is the page at `/p/{token}/expired`, and the same page is shown in
 * place by the other patient pages when the server says the link is dead, so a patient never meets a
 * blank page. A link the server still recognises names its clinic and phone; a guessed one names
 * nothing, so it offers no phone and no clinic.
 */
export function ExpiredPanel({
    view,
    token,
}: {
    view: ExpiredLinkView;
    token: string;
}) {
    const { t } = useT();
    const source = usePatientLinks();
    const describe = usePatientError();
    const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState('');
    const { clinic } = view;

    const request = async () => {
        setPhase('sending');
        setError('');

        try {
            await source.requestNewLink(token);
            setPhase('sent');
        } catch (caught) {
            setPhase('idle');
            setError(describe(caught));
        }
    };

    const title = clinic
        ? t('patient.expired.title')
        : t('patient.expired.unknownTitle');

    return (
        <>
            <Head title={title}>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <PatientShell
                clinicName={clinic?.name}
                className="items-center gap-4 pt-9 text-center"
            >
                <span
                    aria-hidden="true"
                    className="inline-flex size-[72px] items-center justify-center rounded-full bg-[#fff1cc] text-[#8a5a00]"
                >
                    <Link2Off className="size-9" strokeWidth={2.2} />
                </span>
                <h1 className="text-[24px] leading-[1.2] font-bold tracking-[-0.01em] text-ink">
                    {title}
                </h1>
                <p className="max-w-[320px] text-body">
                    {clinic
                        ? t('patient.expired.text')
                        : t('patient.expired.unknownText')}
                </p>

                {phase === 'sent' && (
                    <Notice
                        tone="success"
                        icon={Check}
                        title={t('patient.expired.sent')}
                        className="w-full text-start"
                    />
                )}
                {error && (
                    <Notice
                        tone="danger"
                        role="alert"
                        icon={Link2Off}
                        title={error}
                        className="w-full text-start"
                    />
                )}

                <div className="mt-2 flex w-full flex-col gap-2.5">
                    <PatientButton
                        tone={phase === 'sent' ? 'success' : 'primary'}
                        disabled={phase !== 'idle'}
                        onClick={request}
                    >
                        {phase === 'sending' && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {phase === 'sent'
                            ? `✓ ${t('patient.expired.requested')}`
                            : phase === 'sending'
                              ? t('patient.expired.requesting')
                              : t('patient.expired.request')}
                    </PatientButton>
                    {clinic && (
                        <PatientButton tone="outline" asChild>
                            <a href={`tel:${clinic.phone}`}>
                                <Phone aria-hidden="true" className="size-5" />
                                <span>
                                    {t('patient.call')}{' '}
                                    <span dir="ltr">
                                        {nationalPhone(clinic.phone)}
                                    </span>
                                </span>
                            </a>
                        </PatientButton>
                    )}
                </div>
                <p className="text-small text-subtle">
                    {t('patient.expired.why')}
                </p>
            </PatientShell>
        </>
    );
}
