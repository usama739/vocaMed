import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, TextField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { useAccountSource } from '@/hooks/use-account';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n/scope';
import { LOCALES, LOCALE_NAMES } from '@/i18n/locales';
import { DataError, type AccountUser } from '@/lib/data';

/**
 * Name, email (read only) and language. The language applies the moment it is chosen, like the top
 * bar's switch; Save profile stores it with the name, so the next sign-in opens in it.
 */
export function ProfileCard({
    user,
    onSaved,
}: {
    user: AccountUser;
    onSaved: () => void;
}) {
    const { t, locale } = useT();
    const { setLocale } = useLocale();
    const source = useAccountSource();
    const [name, setName] = useState(user.name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [justSaved, setJustSaved] = useState(false);

    // When the server's name changes (a save, another tab), the field shows it.
    const savedName = user.name;
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(savedName);
    }, [savedName]);

    const dirty = name !== user.name || locale !== user.locale;

    useLeaveGuard(dirty, t('account.leave'));

    const save = async (event: FormEvent) => {
        event.preventDefault();

        if (!name.trim()) {
            setError(t('account.profile.errName'));

            return;
        }

        setSaving(true);
        setError('');

        try {
            await source.saveProfile({ name, locale });
            setJustSaved(true);
            notify('success', t('account.profile.saved'));
            onSaved();
        } catch (caught) {
            setError(
                caught instanceof DataError && caught.field === 'name'
                    ? t('account.profile.errName')
                    : t('account.profile.failed'),
            );
        } finally {
            setSaving(false);
        }
    };

    const emailHint =
        user.role === 'clinic_admin'
            ? t('account.profile.emailHintAdmin')
            : t('account.profile.emailHint');

    return (
        <Card
            aria-labelledby="account-profile"
            className="flex animate-rise flex-col gap-5 p-6 motion-reduce:animate-none"
        >
            <CardTitle id="account-profile">
                {t('account.profile.title')}
            </CardTitle>
            <form onSubmit={save} noValidate className="flex flex-col gap-5">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-[18px]">
                    <TextField
                        label={t('account.profile.name')}
                        value={name}
                        autoComplete="name"
                        error={error}
                        onChange={(event) => {
                            setName(event.target.value);
                            setError('');
                            setJustSaved(false);
                        }}
                    />
                    <FormField
                        label={t('account.profile.email')}
                        hint={emailHint}
                    >
                        {(control) => (
                            <Input
                                {...control}
                                type="email"
                                dir="ltr"
                                readOnly
                                value={user.email}
                                className="bg-surface-hover text-copy"
                            />
                        )}
                    </FormField>
                </div>

                <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
                    <legend className="mb-1.5 p-0 text-label font-semibold text-ink">
                        {t('account.profile.language')}
                    </legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                        {LOCALES.map((code) => (
                            <label
                                key={code}
                                lang={code}
                                className="flex min-h-12 cursor-pointer items-center gap-3 text-control text-ink"
                            >
                                <input
                                    type="radio"
                                    name="account-language"
                                    checked={locale === code}
                                    onChange={() => {
                                        setLocale(code);
                                        setJustSaved(false);
                                    }}
                                    className="m-0 size-[22px] accent-brand"
                                />
                                {LOCALE_NAMES[code]}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={!dirty || saving}>
                        {saving && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {saving
                            ? t('account.profile.saving')
                            : t('account.profile.save')}
                    </Button>
                    {dirty ? (
                        <span
                            role="status"
                            className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                        >
                            {t('account.profile.unsaved')}
                        </span>
                    ) : (
                        justSaved && (
                            <span
                                role="status"
                                className="animate-fade text-label font-semibold text-success-ink motion-reduce:animate-none"
                            >
                                {t('account.profile.saved')}
                            </span>
                        )
                    )}
                </div>
            </form>
        </Card>
    );
}
