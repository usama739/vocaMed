import { Loader2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { useAccountSource } from '@/hooks/use-account';
import { useT } from '@/i18n/scope';
import { DataError } from '@/lib/data';
import { meetsPasswordRule } from '@/lib/validation';

type Fields = { current: string; password: string; confirm: string };
const EMPTY: Fields = { current: '', password: '', confirm: '' };

/**
 * Change password. The checks the server will make (the rule, the match) are also made here so the
 * person hears about them at once; a wrong current password only the server can say, and then the
 * field that is wrong keeps focus.
 */
export function PasswordCard({ onChanged }: { onChanged: () => void }) {
    const { t } = useT();
    const source = useAccountSource();
    const [values, setValues] = useState<Fields>(EMPTY);
    const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
        {},
    );
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const current = useRef<HTMLInputElement>(null);
    const password = useRef<HTMLInputElement>(null);
    const confirm = useRef<HTMLInputElement>(null);

    const set = (key: keyof Fields) => (value: string) => {
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
        setProblem('');
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const found: Partial<Record<keyof Fields, string>> = {};

        if (!values.current) {
            found.current = t('account.password.errEmpty');
        }

        if (!meetsPasswordRule(values.password)) {
            found.password = t('account.password.errRule');
        } else if (values.password !== values.confirm) {
            found.confirm = t('account.password.errMatch');
        }

        if (Object.keys(found).length > 0) {
            setErrors(found);
            (found.current
                ? current
                : found.password
                  ? password
                  : confirm
            ).current?.focus();

            return;
        }

        setSaving(true);
        setProblem('');

        try {
            await source.changePassword(values);
            setValues(EMPTY);
            setErrors({});
            notify('success', t('account.password.changed'));
            onChanged();
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'INVALID_PASSWORD'
            ) {
                setErrors({ current: t('account.password.errCurrent') });
                current.current?.focus();
            } else if (
                caught instanceof DataError &&
                caught.field === 'password'
            ) {
                setErrors({ password: t('account.password.errRule') });
                password.current?.focus();
            } else if (
                caught instanceof DataError &&
                caught.field === 'confirm'
            ) {
                setErrors({ confirm: t('account.password.errMatch') });
                confirm.current?.focus();
            } else {
                setProblem(
                    caught instanceof DataError &&
                        caught.code === 'RATE_LIMITED'
                        ? t('account.password.rate')
                        : t('account.password.failed'),
                );
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card
            aria-labelledby="account-password"
            className="flex animate-rise flex-col gap-5 p-6 [animation-delay:60ms] motion-reduce:animate-none"
        >
            <CardTitle id="account-password">
                {t('account.password.title')}
            </CardTitle>
            <form
                onSubmit={submit}
                noValidate
                className="flex max-w-[420px] flex-col gap-[18px]"
            >
                <PasswordField
                    ref={current}
                    label={t('account.password.current')}
                    value={values.current}
                    autoComplete="current-password"
                    error={errors.current}
                    onChange={(e) => set('current')(e.target.value)}
                />
                <PasswordField
                    ref={password}
                    label={t('account.password.new')}
                    hint={t('account.password.hint')}
                    value={values.password}
                    autoComplete="new-password"
                    error={errors.password}
                    onChange={(e) => set('password')(e.target.value)}
                />
                <PasswordField
                    ref={confirm}
                    label={t('account.password.confirm')}
                    value={values.confirm}
                    autoComplete="new-password"
                    error={errors.confirm}
                    onChange={(e) => set('confirm')(e.target.value)}
                />
                {problem && (
                    <p
                        role="alert"
                        className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-2.5 text-control text-danger-deep"
                    >
                        {problem}
                    </p>
                )}
                <div className="flex flex-col items-start gap-2">
                    <Button type="submit" disabled={saving}>
                        {saving && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {saving
                            ? t('account.password.changing')
                            : t('account.password.change')}
                    </Button>
                    <p className="text-small text-subtle">
                        {t('account.password.note')}
                    </p>
                </div>
            </form>
        </Card>
    );
}
