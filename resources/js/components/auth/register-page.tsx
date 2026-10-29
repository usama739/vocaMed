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
import {
    CheckboxField,
    PasswordField,
    SelectField,
    TextField,
} from '@/components/vocamed/form-fields';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource } from '@/lib/data';
import {
    COUNTRIES,
    TIMEZONES,
    timezoneLabel,
    type CountryCode,
} from '@/lib/geo';
import { isEmail, meetsPasswordRule } from '@/lib/validation';
import { marketingPrimary } from '@/components/public/marketing';
import { cn } from '@/lib/utils';

type Field = 'clinic' | 'name' | 'email' | 'password' | 'terms';

/**
 * A2. Clinic sign-up: clinic, country and timezone, the first admin's details and the terms.
 * Choosing a country pre-selects its timezone. Success shows "Check your email" in place.
 */
export function RegisterPage({ source = auth }: { source?: AuthSource }) {
    const { t } = useT();
    const [clinic, setClinic] = useState('');
    const [country, setCountry] = useState<CountryCode>('PK');
    const [timezone, setTimezone] = useState('Asia/Karachi');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [terms, setTerms] = useState(false);
    const [errors, setErrors] = useState<Errors<Field>>({});
    const [phase, setPhase] = useState<
        'idle' | 'submitting' | 'sent' | 'error'
    >('idle');
    const form = useFocusFirstError(errors);

    const clear = (field: Field) =>
        setErrors((current) => {
            const { [field]: _removed, ...rest } = current;
            void _removed;

            return rest;
        });

    const chooseCountry = (code: string) => {
        const picked = COUNTRIES.find((c) => c.code === code);

        setCountry(code as CountryCode);

        if (picked?.timezone) {
            setTimezone(picked.timezone);
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (phase === 'submitting') {
            return;
        }

        const next: Errors<Field> = {};

        if (!clinic.trim()) {
            next.clinic = 'required';
        }

        if (!name.trim()) {
            next.name = 'required';
        }

        if (!email.trim()) {
            next.email = 'required';
        } else if (!isEmail(email)) {
            next.email = 'email';
        }

        if (!password) {
            next.password = 'required';
        } else if (!meetsPasswordRule(password)) {
            next.password = 'passwordRule';
        }

        if (!terms) {
            next.terms = 'terms';
        }

        setErrors(next);

        if (Object.keys(next).length > 0) {
            return;
        }

        setPhase('submitting');

        try {
            const result = await source.registerClinic({
                clinic,
                country,
                timezone,
                name,
                email,
                password,
            });

            if (result.ok) {
                setPhase('sent');

                return;
            }

            setErrors({ email: result.errors.email });
            setPhase('idle');
        } catch {
            setPhase('error');
        }
    };

    const linkClass =
        'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-hover underline-offset-4 transition-colors hover:text-brand-deep hover:underline';

    return (
        <PublicLayout variant="auth" footer={<AuthFooter />}>
            <AuthStage width={560} align="start">
                {phase === 'sent' ? (
                    <StatusPanel
                        tone="info"
                        title={t('auth.register.sentTitle')}
                        actions={
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setPhase('idle')}
                                >
                                    {t('auth.register.wrong')}
                                </Button>
                                <Link href="/login" className={linkClass}>
                                    {t('auth.common.signIn')}
                                </Link>
                            </>
                        }
                    >
                        <p>{t('auth.register.sentText')}</p>
                        <p className="text-label text-subtle">
                            {t('auth.register.sentHelp')}
                        </p>
                    </StatusPanel>
                ) : (
                    <>
                        <AuthCard
                            title={t('auth.register.title')}
                            lead={t('auth.register.sub')}
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
                                    label={t('auth.register.clinic')}
                                    autoComplete="organization"
                                    value={clinic}
                                    error={
                                        errors.clinic &&
                                        t(`auth.errors.${errors.clinic}`)
                                    }
                                    onChange={(event) => {
                                        setClinic(event.target.value);
                                        clear('clinic');
                                    }}
                                />
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[18px]">
                                    <SelectField
                                        label={t('auth.register.country')}
                                        value={country}
                                        onValueChange={chooseCountry}
                                        options={COUNTRIES.map((c) => ({
                                            value: c.code,
                                            label: t(
                                                `auth.countries.${c.code}`,
                                            ),
                                        }))}
                                    />
                                    <SelectField
                                        label={t('auth.register.timezone')}
                                        value={timezone}
                                        onValueChange={setTimezone}
                                        options={TIMEZONES.map((tz) => ({
                                            value: tz.id,
                                            label: timezoneLabel(tz),
                                        }))}
                                    />
                                </div>
                                <TextField
                                    label={t('auth.register.admin')}
                                    autoComplete="name"
                                    value={name}
                                    error={
                                        errors.name &&
                                        t(`auth.errors.${errors.name}`)
                                    }
                                    onChange={(event) => {
                                        setName(event.target.value);
                                        clear('name');
                                    }}
                                />
                                <TextField
                                    label={t('auth.register.email')}
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
                                    onChange={(event) => {
                                        setEmail(event.target.value);
                                        clear('email');
                                    }}
                                />
                                <PasswordField
                                    label={t('auth.register.password')}
                                    autoComplete="new-password"
                                    hint={t('auth.common.passwordHint')}
                                    value={password}
                                    error={
                                        errors.password &&
                                        t(`auth.errors.${errors.password}`)
                                    }
                                    onChange={(event) => {
                                        setPassword(event.target.value);
                                        clear('password');
                                    }}
                                />
                                <CheckboxField
                                    checked={terms}
                                    error={
                                        errors.terms &&
                                        t(`auth.errors.${errors.terms}`)
                                    }
                                    onCheckedChange={(value) => {
                                        setTerms(value);
                                        clear('terms');
                                    }}
                                    label={
                                        <>
                                            {t('auth.register.termsPre')}{' '}
                                            <Link
                                                href="/privacy"
                                                className="font-semibold text-brand-hover underline-offset-4 hover:underline"
                                            >
                                                {t('auth.register.termsLink')}
                                            </Link>
                                        </>
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
                                    {t('auth.register.create')}
                                </Button>
                            </form>
                            <p className="text-small text-subtle">
                                {t('auth.register.note')}
                            </p>
                        </AuthCard>
                        <p
                            className="flex animate-rise flex-wrap items-center justify-center gap-x-1.5 text-control"
                            style={{ animationDelay: '120ms' }}
                        >
                            {t('auth.register.have')}
                            <Link href="/login" className={linkClass}>
                                {t('auth.common.signIn')}
                            </Link>
                        </p>
                    </>
                )}
            </AuthStage>
        </PublicLayout>
    );
}
