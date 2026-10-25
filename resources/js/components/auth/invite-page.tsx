import { Link } from '@inertiajs/react';
import { Loader2, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    useFocusFirstError,
    type Errors,
} from '@/components/auth/use-auth-form';
import {
    AuthCard,
    AuthCardSkeleton,
    FormAlert,
    StatusPanel,
} from '@/components/public/auth-card';
import {
    AuthFooter,
    AuthStage,
    PublicLayout,
} from '@/components/public/public-layout';
import { Button } from '@/components/ui/button';
import { PasswordField, TextField } from '@/components/vocamed/form-fields';
import { useAsyncValue } from '@/hooks/use-async-value';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource } from '@/lib/data';
import { meetsPasswordRule } from '@/lib/validation';

/**
 * A6. Accept an invitation: shows the clinic and role, then sets a name and password.
 * Expired and used links have their own states; unknown tokens look expired.
 */
export function InvitePage({
    token,
    source = auth,
}: {
    token: string;
    source?: AuthSource;
}) {
    const { t } = useT();
    const invitation = useAsyncValue(`invite:${token}`, () =>
        source.getInvitation(token),
    );
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Errors<'name' | 'password'>>({});
    const [phase, setPhase] = useState<
        'idle' | 'submitting' | 'done' | 'expired' | 'used' | 'error'
    >('idle');
    const form = useFocusFirstError(errors);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (phase === 'submitting') {
            return;
        }

        const next: Errors<'name' | 'password'> = {};

        if (!name.trim()) {
            next.name = 'required';
        }

        if (!password) {
            next.password = 'required';
        } else if (!meetsPasswordRule(password)) {
            next.password = 'passwordRule';
        }

        setErrors(next);

        if (Object.keys(next).length > 0) {
            return;
        }

        setPhase('submitting');

        try {
            const result = await source.acceptInvitation({
                token,
                name,
                password,
            });
            setPhase(result.ok ? 'done' : result.reason);
        } catch {
            setPhase('error');
        }
    };

    const state =
        phase === 'expired' || phase === 'used'
            ? phase
            : invitation.value?.state;

    const signIn = (
        <Button size="lg" asChild>
            <Link href="/login">{t('auth.common.signIn')}</Link>
        </Button>
    );

    return (
        <PublicLayout variant="auth" footer={<AuthFooter />}>
            <AuthStage width={460}>
                {invitation.loading ? (
                    <AuthCardSkeleton />
                ) : phase === 'done' ? (
                    <StatusPanel
                        tone="success"
                        title={t('auth.invite.doneTitle')}
                        actions={signIn}
                    >
                        <p>{t('auth.invite.doneText')}</p>
                    </StatusPanel>
                ) : state === 'expired' ? (
                    <StatusPanel
                        tone="warning"
                        title={t('auth.invite.expTitle')}
                    >
                        <p>{t('auth.invite.expText')}</p>
                    </StatusPanel>
                ) : state === 'used' ? (
                    <StatusPanel
                        tone="neutral"
                        title={t('auth.invite.usedTitle')}
                        actions={signIn}
                    >
                        <p>{t('auth.invite.usedText')}</p>
                    </StatusPanel>
                ) : (
                    <AuthCard title={t('auth.invite.title')}>
                        <dl className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-subtle px-4 py-3.5">
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-label text-subtle">
                                    {t('auth.invite.clinicLabel')}
                                </dt>
                                <dd className="text-control font-semibold text-ink">
                                    {(invitation.value?.state === 'valid' &&
                                        invitation.value.clinicName) ||
                                        t('shell.clinicName')}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-label text-subtle">
                                    {t('auth.invite.roleLabel')}
                                </dt>
                                <dd>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-3 py-[5px] text-label font-semibold text-brand-deep">
                                        <UserRound
                                            aria-hidden="true"
                                            className="size-3.5"
                                            strokeWidth={2.2}
                                        />
                                        {invitation.value?.state === 'valid'
                                            ? t(
                                                  `roles.${invitation.value.role}`,
                                              )
                                            : ''}
                                    </span>
                                </dd>
                            </div>
                        </dl>

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
                                label={t('auth.invite.name')}
                                autoComplete="name"
                                value={name}
                                error={
                                    errors.name &&
                                    t(`auth.errors.${errors.name}`)
                                }
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                            <PasswordField
                                label={t('auth.invite.password')}
                                autoComplete="new-password"
                                hint={t('auth.common.passwordHint')}
                                value={password}
                                error={
                                    errors.password &&
                                    t(`auth.errors.${errors.password}`)
                                }
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                            />
                            <Button
                                type="submit"
                                size="lg"
                                className="w-full"
                                aria-busy={phase === 'submitting'}
                            >
                                {phase === 'submitting' && (
                                    <Loader2
                                        aria-hidden="true"
                                        className="animate-spin"
                                    />
                                )}
                                {t('auth.invite.accept')}
                            </Button>
                        </form>

                        <p className="flex flex-wrap items-center gap-x-1 text-small text-subtle">
                            {t('auth.invite.terms')}
                            <Link
                                href="/privacy"
                                className="inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-hover underline-offset-4 hover:underline"
                            >
                                {t('auth.invite.termsLink')}
                            </Link>
                        </p>
                    </AuthCard>
                )}
            </AuthStage>
        </PublicLayout>
    );
}
