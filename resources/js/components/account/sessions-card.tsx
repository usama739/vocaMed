import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { FormDialog } from '@/components/admin/form-dialog';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/vocamed/form-fields';
import { useAccountSource } from '@/hooks/use-account';
import { useT } from '@/i18n/scope';
import { DataError } from '@/lib/data';

/**
 * Sign out every other session. Laravel needs the password to do it, which also guards against
 * someone using an unlocked screen, so a small dialog asks for it first.
 */
export function SessionsCard({ onDone }: { onDone: () => void }) {
    const { t } = useT();
    const source = useAccountSource();
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const [ended, setEnded] = useState<number | null>(null);

    const close = (next: boolean) => {
        setOpen(next);

        if (!next) {
            setPassword('');
            setError('');
        }
    };

    const submit = async () => {
        if (!password) {
            setError(t('account.sessions.errPassword'));

            return;
        }

        setPending(true);
        setError('');

        try {
            const result = await source.signOutOthers({ password });
            setEnded(result.ended);
            close(false);
            onDone();
        } catch (caught) {
            setError(
                caught instanceof DataError &&
                    caught.code === 'INVALID_PASSWORD'
                    ? t('account.sessions.errPassword')
                    : caught instanceof DataError &&
                        caught.code === 'RATE_LIMITED'
                      ? t('account.sessions.rate')
                      : t('account.sessions.failed'),
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <Card
            aria-labelledby="account-sessions"
            className="flex animate-rise flex-col gap-3.5 p-6 [animation-delay:180ms] motion-reduce:animate-none"
        >
            <div className="flex flex-col gap-1">
                <CardTitle id="account-sessions">
                    {t('account.sessions.title')}
                </CardTitle>
                <p className="text-[14.5px]">{t('account.sessions.sub')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3.5">
                <Button
                    variant="outline-destructive"
                    onClick={() => setOpen(true)}
                >
                    {t('account.sessions.signOut')}
                </Button>
                <span role="status">
                    {ended !== null && (
                        <span className="inline-flex animate-fade items-center gap-2 text-label font-semibold text-success-ink motion-reduce:animate-none">
                            <CircleCheck
                                aria-hidden="true"
                                className="size-[18px]"
                            />
                            {ended === 0
                                ? t('account.sessions.none')
                                : t('account.sessions.signedOut', {
                                      count: ended,
                                  })}
                        </span>
                    )}
                </span>
            </div>

            <FormDialog
                open={open}
                onOpenChange={close}
                title={t('account.sessions.dialogTitle')}
                description={t('account.sessions.dialogText')}
                submitLabel={t('account.sessions.confirm')}
                cancelLabel={t('account.sessions.cancel')}
                pending={pending}
                onSubmit={submit}
            >
                <PasswordField
                    label={t('account.sessions.password')}
                    value={password}
                    autoComplete="current-password"
                    error={error}
                    onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                    }}
                />
            </FormDialog>
        </Card>
    );
}
