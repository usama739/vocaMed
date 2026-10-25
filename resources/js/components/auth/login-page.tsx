import { Link } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    focusField,
    formatCountdown,
    useFocusFirstError,
    type Errors,
} from '@/components/auth/use-auth-form';
import { AuthCard, FormAlert } from '@/components/public/auth-card';
import {
    AuthFooter,
    AuthStage,
    PublicLayout,
} from '@/components/public/public-layout';
import {
    CheckboxField,
    PasswordField,
    TextField,
} from '@/components/vocamed/form-fields';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource, type Role } from '@/lib/data';
import { isEmail } from '@/lib/validation';

type Phase = 'idle' | 'submitting' | 'invalid' | 'throttled' | 'error' | 'done';

const linkClass =
    'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-hover underline-offset-4 transition-colors hover:text-brand-deep hover:underline';

/**
 * A3. Sign in. Submits to the AuthSource (a mock until the backend exists) and hands the
 * role back through `onSignedIn`, which the page turns into a redirect to the role's home.
 */
export function LoginPage({
    source = auth,
    onSignedIn,
}: {
    source?: AuthSource;
    onSignedIn: (role: Role) => void;
}) {
    const { t } = useT();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);
    const [errors, setErrors] = useState<Errors<'email' | 'password'>>({});
    const [phase, setPhase] = useState<Phase>('idle');
    const [retry, setRetry] = useState(0);
    const form = useFocusFirstError(errors);

    useEffect(() => {
        if (phase !== 'throttled') {
            return;
        }

        const timer = window.setInterval(() => {
            setRetry((left) => {
                if (left <= 1) {
                    window.clearInterval(timer);
                    setPhase('idle');

                    return 0;
                }

                return left - 1;
            });
        }, 1000);

        return () => window.clearInterval(timer);
    }, [phase]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (
            phase === 'submitting' ||
            phase === 'throttled' ||
            phase === 'done'
        ) {
            return;
        }

        const next: Errors<'email' | 'password'> = {};

        if (!email.trim()) {
            next.email = 'required';
        } else if (!isEmail(email)) {
            next.email = 'email';
        }

        if (!password) {
            next.password = 'required';
        }

        setErrors(next);

        if (Object.keys(next).length > 0) {
            setPhase('idle');

            return;
        }

        setPhase('submitting');

        try {
            const result = await source.login({ email, password, remember });

            if (result.ok) {
                setPhase('done');
                onSignedIn(result.role);

                return;
            }

            if (result.reason === 'throttled') {
                setPassword('');
                setRetry(result.retryAfterSec);
                setPhase('throttled');

                return;
            }

            setPassword('');
            setPhase('invalid');
            window.setTimeout(() => focusField(form.current, 'password'), 0);
        } catch {
            setPhase('error');
        }
    };

    const busy = phase === 'submitting' || phase === 'done';

    return (
        <PublicLayout variant="auth" footer={<AuthFooter />}>
            <AuthStage width={440}>
                <AuthCard
                    title={t('auth.login.title')}
                    lead={t('auth.login.sub')}
                >
                    {phase === 'invalid' && (
                        <FormAlert>{t('auth.login.invalid')}</FormAlert>
                    )}
                    {phase === 'throttled' && (
                        <FormAlert tone="warning">
                            <span className="sr-only">
                                {t('auth.login.throttledSr')}
                            </span>
                            <span aria-hidden="true">
                                {t('auth.login.throttled', {
                                    time: formatCountdown(retry),
                                })}
                            </span>
                        </FormAlert>
                    )}
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
                            label={t('auth.login.email')}
                            type="email"
                            dir="ltr"
                            autoComplete="email"
                            inputMode="email"
                            placeholder={t('auth.common.emailPlaceholder')}
                            value={email}
                            data-field="email"
                            error={
                                errors.email && t(`auth.errors.${errors.email}`)
                            }
                            onChange={(event) => setEmail(event.target.value)}
                        />
                        <PasswordField
                            label={t('auth.login.password')}
                            autoComplete="current-password"
                            value={password}
                            data-field="password"
                            error={
                                errors.password &&
                                t(`auth.errors.${errors.password}`)
                            }
                            labelAction={
                                <Link
                                    href="/forgot-password"
                                    className="-my-3 inline-flex min-h-11 items-center rounded-md px-1 text-label font-semibold text-brand-hover transition-colors hover:text-brand-deep hover:underline"
                                >
                                    {t('auth.login.forgot')}
                                </Link>
                            }
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                        />
                        <CheckboxField
                            label={t('auth.login.remember')}
                            checked={remember}
                            onCheckedChange={setRemember}
                        />
                        <Button
                            type="submit"
                            size="lg"
                            className="w-full"
                            disabled={phase === 'throttled'}
                            aria-busy={busy}
                        >
                            {busy && (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            )}
                            {t('auth.login.signin')}
                        </Button>
                    </form>
                </AuthCard>

                <div
                    className="flex animate-rise flex-col items-center gap-1 text-center"
                    style={{ animationDelay: '120ms' }}
                >
                    <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-control">
                        {t('auth.login.newClinic')}
                        <Link href="/register" className={linkClass}>
                            {t('auth.login.start')}
                        </Link>
                    </p>
                    <p className="text-small text-subtle">
                        {t('auth.login.invited')}
                    </p>
                </div>
            </AuthStage>
        </PublicLayout>
    );
}
