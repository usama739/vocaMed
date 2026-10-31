import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { digitsOf } from '@/components/reception/format';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { FormField, TextField } from '@/components/vocamed/form-fields';
import { Input } from '@/components/ui/input';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useT } from '@/i18n/scope';
import type { Locale } from '@/i18n/locales';
import type { Patient } from '@/lib/data';

/** A plain check on the screen; the server holds the real rule. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Add a patient": name, mobile phone and message language. Field errors sit under the field;
 * a phone number that already belongs to someone is reported instead of creating a duplicate.
 */
export function NewPatientDialog({
    open,
    onOpenChange,
    initialPhone = '',
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Digits already typed in the search box, so the receptionist does not retype them. */
    initialPhone?: string;
    onSaved: (patient: Patient) => void;
}) {
    const { locale, dir } = useT();
    const source = useData();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={dir}
                lang={locale}
                className="max-w-[480px] sm:max-w-[480px]"
            >
                {/* Remounts on each open, so the form always starts clean. */}
                {open && (
                    <NewPatientForm
                        key={initialPhone}
                        initialPhone={initialPhone}
                        onCancel={() => onOpenChange(false)}
                        onSubmit={async (input) => {
                            const patient = await source.patients.create(input);
                            onSaved(patient);
                            onOpenChange(false);
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function NewPatientForm({
    initialPhone,
    onCancel,
    onSubmit,
}: {
    initialPhone: string;
    onCancel: () => void;
    onSubmit: (input: {
        name: string;
        phone: string;
        email?: string;
        preferredLocale: Locale;
    }) => Promise<void>;
}) {
    const { t } = useT();
    const { forField } = useErrorText();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState(initialPhone);
    const [email, setEmail] = useState('');
    const [language, setLanguage] = useState<Locale>('ur');
    const [errors, setErrors] = useState<{
        name?: string;
        phone?: string;
        email?: string;
        form?: string;
    }>({});
    const [saving, setSaving] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const next: typeof errors = {};

        if (!name.trim()) {
            next.name = t('reception.patients.errName');
        }

        if (digitsOf(phone).length < 10) {
            next.phone = t('reception.patients.errPhone');
        }

        if (email.trim() !== '' && !EMAIL.test(email.trim())) {
            next.email = t('reception.patients.errEmail');
        }

        setErrors(next);

        if (next.name || next.phone || next.email) {
            return;
        }

        setSaving(true);

        try {
            await onSubmit({
                name: name.trim(),
                phone: phone.trim(),
                ...(email.trim() === '' ? {} : { email: email.trim() }),
                preferredLocale: language,
            });
        } catch (caught) {
            const { field, message } = forField(caught);

            setErrors(
                field === 'phone' || field === 'name' || field === 'email'
                    ? { [field]: message }
                    : { form: t('reception.patients.saveFailed') },
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <DialogTitle>{t('reception.patients.addTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
                {t('reception.patients.sub')}
            </DialogDescription>

            <TextField
                label={t('reception.patients.fName')}
                value={name}
                error={errors.name}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
            />
            <FormField
                label={t('reception.patients.fPhone')}
                error={errors.phone}
            >
                {(control) => (
                    <Input
                        {...control}
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        value={phone}
                        autoComplete="off"
                        placeholder="03xx xxxxxxx"
                        onChange={(event) => setPhone(event.target.value)}
                        className="text-start"
                    />
                )}
            </FormField>
            <FormField
                label={t('reception.patients.fEmail')}
                error={errors.email}
            >
                {(control) => (
                    <Input
                        {...control}
                        type="email"
                        inputMode="email"
                        dir="ltr"
                        value={email}
                        autoComplete="off"
                        onChange={(event) => setEmail(event.target.value)}
                        className="text-start"
                    />
                )}
            </FormField>
            <div
                role="group"
                aria-label={t('reception.patients.fLang')}
                className="flex flex-col gap-1.5"
            >
                <span className="text-label font-semibold text-ink">
                    {t('reception.patients.fLang')}
                </span>
                <div className="flex gap-2">
                    {(['ur', 'en'] as const).map((code) => (
                        <ChoiceChip
                            key={code}
                            pressed={language === code}
                            onClick={() => setLanguage(code)}
                        >
                            {t(`reception.langName.${code}`)}
                        </ChoiceChip>
                    ))}
                </div>
            </div>

            {errors.form && (
                <p
                    role="alert"
                    className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                >
                    {errors.form}
                </p>
            )}

            <div className="flex flex-wrap justify-end gap-2.5">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {t('reception.patients.cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving && (
                        <Loader2
                            aria-hidden="true"
                            className="animate-spin motion-reduce:animate-none"
                        />
                    )}
                    {t('reception.patients.save')}
                </Button>
            </div>
        </form>
    );
}
