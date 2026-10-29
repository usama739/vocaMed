import { Link } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    AuthCard,
    AuthCardSkeleton,
    FormAlert,
    StatusPanel,
} from '@/components/public/auth-card';
import { PasswordStrength } from '@/components/public/password-strength';
import {
    AuthFooter,
    AuthStage,
    PublicLayout,
} from '@/components/public/public-layout';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/vocamed/form-fields';
import { useAsyncValue } from '@/hooks/use-async-value';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource } from '@/lib/data';
import { meetsPasswordRule } from '@/lib/validation';
import { marketingPrimary } from '@/components/public/marketing';
import { cn } from '@/lib/utils';

/**
 * A5. Choose a new password from a reset link. Unknown, used and expired links all show the
 * same "expired" state, so a link's history is never revealed.
 */
export function ResetPage({
    token,
    email = '',
    source = auth,
}: {
    token: string;
    /** The address the link was sent to; it travels in the link's query string. */
    email?: string;
    source?: AuthSource;
}) {
    const { t } = useT();
    const check = useAsyncValue(`reset:${token}`, () =>
        source.checkResetToken({ token, email }),
    );
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [touched, setTouched] = useState(false);
    const [phase, setPhase] = useState<
        'idle' | 'submitting' | 'done' | 'expired' | 'error'
    >('idle');

    const mismatch = confirm.length > 0 && password !== confirm;
    const weak = touched && password.length > 0 && !meetsPasswordRule(password);
    const ready =
        meetsPasswordRule(password) && confirm.length > 0 && !mismatch;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setTouched(true);

        if (!ready || phase === 'submitting') {
            return;
        }

        setPhase('submitting');

        try {
            const result = await source.resetPassword({
                token,
                email,
                password,
            });
            setPhase(result.ok ? 'done' : 'expired');
        } catch {
            setPhase('error');
        }
    };

    const expired = check.value === 'expired' || phase === 'expired';

    return (
        <PublicLayout variant="auth" footer={<AuthFooter />}>
            <AuthStage width={440}>
                {check.loading ? (
                    <AuthCardSkeleton />
                ) : phase === 'done' ? (
                    <StatusPanel
                        tone="success"
                        title={t('auth.reset.doneTitle')}
                        actions={
                            <Button
                                size="lg"
                                className={marketingPrimary}
                                asChild
                            >
                                <Link href="/login">
                                    {t('auth.common.signIn')}
                                </Link>
                            </Button>
                        }
                    >
                        <p>{t('auth.reset.doneText')}</p>
                    </StatusPanel>
                ) : expired ? (
                    <StatusPanel
                        tone="warning"
                        title={t('auth.reset.expTitle')}
                        actions={
                            <Button
                                size="lg"
                                className={marketingPrimary}
                                asChild
                            >
                                <Link href="/forgot-password">
                                    {t('auth.reset.expBtn')}
                                </Link>
                            </Button>
                        }
                    >
                        <p>{t('auth.reset.expText')}</p>
                    </StatusPanel>
                ) : (
                    <AuthCard
                        title={t('auth.reset.title')}
                        lead={t('auth.reset.sub')}
                    >
                        {phase === 'error' && (
                            <FormAlert>{t('auth.errors.server')}</FormAlert>
                        )}
                        <form
                            onSubmit={submit}
                            noValidate
                            className="flex flex-col gap-[18px]"
                        >
                            <div className="flex flex-col gap-2.5">
                                <PasswordField
                                    label={t('auth.reset.newPw')}
                                    autoComplete="new-password"
                                    value={password}
                                    aria-describedby="reset-hint"
                                    error={
                                        weak
                                            ? t('auth.errors.passwordRule')
                                            : undefined
                                    }
                                    onBlur={() => setTouched(true)}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                />
                                <PasswordStrength password={password} />
                                <p
                                    id="reset-hint"
                                    className="text-small text-subtle"
                                >
                                    {t('auth.common.passwordHint')}
                                </p>
                            </div>
                            <PasswordField
                                label={t('auth.reset.confirm')}
                                autoComplete="new-password"
                                value={confirm}
                                error={
                                    mismatch
                                        ? t('auth.errors.mismatch')
                                        : undefined
                                }
                                onChange={(event) =>
                                    setConfirm(event.target.value)
                                }
                            />
                            <Button
                                type="submit"
                                size="lg"
                                className={cn(marketingPrimary, 'w-full')}
                                disabled={!ready}
                                aria-busy={phase === 'submitting'}
                            >
                                {phase === 'submitting' && (
                                    <Loader2
                                        aria-hidden="true"
                                        className="animate-spin"
                                    />
                                )}
                                {t('auth.reset.save')}
                            </Button>
                        </form>
                    </AuthCard>
                )}
            </AuthStage>
        </PublicLayout>
    );
}
