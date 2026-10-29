import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { digitsOf } from '@/components/reception/format';
import { Button } from '@/components/ui/button';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { FormField } from '@/components/vocamed/form-fields';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/scope';
import type { Doctor } from '@/lib/data';

export type WalkInInput = { name: string; phone: string; doctorId: string };

/**
 * Walk-in quick add: a name (required), a phone number (optional) and the doctor's queue to
 * join. A walk-in without a phone is saved; the profile then says messages cannot be sent.
 */
export function WalkInForm({
    doctors,
    onAdd,
}: {
    doctors: Doctor[];
    /** Resolves when saved; may throw to keep the form as it is. */
    onAdd: (input: WalkInInput) => Promise<void>;
}) {
    const { t } = useT();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [picked, setPicked] = useState<string | null>(null);
    const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
    const [saving, setSaving] = useState(false);

    const doctorId =
        picked && doctors.some((d) => d.id === picked)
            ? picked
            : doctors[0]?.id;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const next: typeof errors = {};

        if (!name.trim()) {
            next.name = t('reception.today.errName');
        }

        if (phone.trim() && digitsOf(phone).length < 10) {
            next.phone = t('reception.today.errPhone');
        }

        setErrors(next);

        if (next.name || next.phone || !doctorId) {
            return;
        }

        setSaving(true);

        try {
            await onAdd({ name: name.trim(), phone: phone.trim(), doctorId });
            setName('');
            setPhone('');
        } catch {
            // The page already told the receptionist; keep what they typed.
        } finally {
            setSaving(false);
        }
    };

    return (
        <form
            onSubmit={submit}
            noValidate
            className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-subtle p-4 shadow-soft"
        >
            <FormField
                label={t('reception.today.walkin')}
                error={errors.name}
                className="min-w-[220px] flex-[1_1_220px]"
            >
                {(control) => (
                    <Input
                        {...control}
                        value={name}
                        autoComplete="off"
                        placeholder={t('reception.today.walkinPlaceholder')}
                        onChange={(event) => setName(event.target.value)}
                    />
                )}
            </FormField>
            <FormField
                label={t('reception.today.walkinPhone')}
                optional
                error={errors.phone}
                className="min-w-[180px] flex-[0_1_200px]"
            >
                {(control) => (
                    <Input
                        {...control}
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        value={phone}
                        autoComplete="off"
                        placeholder={t(
                            'reception.today.walkinPhonePlaceholder',
                        )}
                        onChange={(event) => setPhone(event.target.value)}
                        className="text-start"
                    />
                )}
            </FormField>
            <div
                role="group"
                aria-label={t('reception.today.doctor')}
                className="flex flex-col gap-1.5"
            >
                <span className="text-label font-semibold text-ink">
                    {t('reception.today.doctor')}
                </span>
                <div className="flex flex-wrap gap-2">
                    {doctors.map((doctor) => (
                        <ChoiceChip
                            key={doctor.id}
                            pressed={doctorId === doctor.id}
                            onClick={() => setPicked(doctor.id)}
                        >
                            {doctor.name}
                        </ChoiceChip>
                    ))}
                </div>
            </div>
            <Button type="submit" disabled={saving} className="mt-[26px]">
                {saving && (
                    <Loader2
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
                    />
                )}
                {t('reception.today.add')}
            </Button>
        </form>
    );
}
