import { Link } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    useFocusFirstError,
    type Errors,
} from '@/components/auth/use-auth-form';
import {
    AuthCard,
    FormAlert,
    StatusPanel,
} from '@/components/public/auth-card';
import {
    AuthFooter,
    AuthStage,
    PublicLayout,
} from '@/components/public/public-layout';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/vocamed/form-fields';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource } from '@/lib/data';
import { isEmail } from '@/lib/validation';
import { marketingPrimary } from '@/components/public/marketing';
import { cn } from '@/lib/utils';

const backLink =
    'inline-flex min-h-11 items-center rounded-md px-2 text-control font-semibold text-brand-hover transition-colors hover:text-brand-deep hover:underline';

/**
 * A4. Ask for a reset link. The answer is the same whether or not the address has an
 * account, so the page never reveals who is registered.
 */
export function ForgotPage({ source = auth }: { source?: AuthSource }) {
    const { t } = useT();
    const [email, setEmail] = useState('');
    const [errors, setErrors] = useState<Errors<'email'>>({});
    const [phase, setPhase] = useState<
        'idle' | 'submitting' | 'sent' | 'error'
    >('idle');
    const form = useFocusFirstError(errors);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (phase === 'submitting') {
            return;
        }

        const next: Errors<'email'> = {};

        if (!email.trim()) {
            next.email = 'required';
        } else if (!isEmail(email)) {
            next.email = 'email';
        }

        setErrors(next);

        if (next.email) {
            return;
        }

        setPhase('submitting');

        try {
            await source.requestPasswordReset(email);
            setPhase('sent');
        } catch {
            setPhase('error');
        }
    };

    return (
        <PublicLayout variant="auth" footer={<AuthFooter />}>
            <AuthStage width={440}>
                {phase === 'sent' ? (
                    <StatusPanel
                        tone="info"
                        title={t('auth.forgot.sentTitle')}
                        actions={
                            <Link href="/login" className={backLink}>
                                {t('auth.common.backToSignIn')}
                            </Link>
                        }
                    >
                        <p>{t('auth.forgot.sentText')}</p>
                        <p className="text-label text-subtle">
                            {t('auth.forgot.sentHelp')}
                        </p>
                    </StatusPanel>
                ) : (
                    <>
                        <AuthCard
                            title={t('auth.forgot.title')}
                            lead={t('auth.forgot.sub')}
                        >
                            {phase === 'error' && (
                                <FormAlert>{t('auth.errors.server')}</FormAlert>
                            )}
                            <form
                                ref={form}
                                onSubmit={submit}
                                noValidate
                                className="flex flex-col gap-[18px]"
                            >
                                <TextField
                                    label={t('auth.forgot.email')}
                                    type="email"
                                    dir="ltr"
                                    autoComplete="email"
                                    inputMode="email"
                                    placeholder={t(
                                        'auth.common.emailPlaceholder',
                                    )}
                                    value={email}
                                    error={
                                        errors.email &&
                                        t(`auth.errors.${errors.email}`)
                                    }
                                    onChange={(event) =>
                                        setEmail(event.target.value)
                                    }
                                />
                                <Button
                                    type="submit"
                                    size="lg"
                                    className={cn(marketingPrimary, 'w-full')}
                                    aria-busy={phase === 'submitting'}
                                >
                                    {phase === 'submitting' && (
                                        <Loader2
                                            aria-hidden="true"
                                            className="animate-spin"
                                        />
                                    )}
                                    {t('auth.forgot.send')}
                                </Button>
                            </form>
                        </AuthCard>
                        <p className="text-center">
                            <Link href="/login" className={backLink}>
                                {t('auth.common.backToSignIn')}
                            </Link>
                        </p>
                    </>
                )}
            </AuthStage>
        </PublicLayout>
    );
}
