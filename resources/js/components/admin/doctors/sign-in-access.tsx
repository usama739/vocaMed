import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { StatusPill, type PillTone } from '@/components/admin/status-pill';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/vocamed/form-fields';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useErrorText } from '@/hooks/use-error-text';
import { useT } from '@/i18n/scope';
import { DataError, type DoctorSignIn, type Id } from '@/lib/data';

const TONE: Record<DoctorSignIn['state'], PillTone | null> = {
    none: null,
    invited: 'invited',
    expired: 'expired',
    active: 'active',
};

/**
 * How a doctor gets a login: invite them by email, resend or revoke the invitation, or see who
 * they sign in as. It acts at once and is independent of the profile's Save button. A doctor who
 * does not exist yet has to be saved first.
 */
export function SignInAccess({
    doctorId,
    signIn,
    onChanged,
}: {
    /** `null` while the doctor has not been created. */
    doctorId: Id | null;
    signIn: DoctorSignIn;
    onChanged: () => void;
}) {
    const { t } = useT();
    const source = useData();
    const { message } = useErrorText();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'invite' | 'resend' | 'revoke' | null>(
        null,
    );

    const status =
        signIn.state === 'none'
            ? t('admin.doctor.signIn.none')
            : t(`admin.doctor.signIn.${signIn.state}`, {
                  email: signIn.email ?? '',
              });
    const tone = TONE[signIn.state];
    const pillLabel =
        signIn.state === 'invited'
            ? t('admin.doctor.signIn.pillInvited')
            : signIn.state === 'expired'
              ? t('admin.doctor.signIn.pillExpired')
              : t('admin.common.active');

    const invite = async (event: FormEvent) => {
        event.preventDefault();

        if (!doctorId || busy) {
            return;
        }

        setBusy('invite');
        setError('');

        try {
            await source.doctors.invite(doctorId, email);
            notify('success', t('admin.doctor.signIn.sent', { email }));
            setEmail('');
            onChanged();
        } catch (caught) {
            setError(
                caught instanceof DataError && caught.code === 'VALIDATION'
                    ? t('admin.doctor.signIn.errEmail')
                    : message(caught),
            );
        } finally {
            setBusy(null);
        }
    };

    const again = async (kind: 'resend' | 'revoke') => {
        if (!signIn.invitationId || busy) {
            return;
        }

        setBusy(kind);

        try {
            if (kind === 'resend') {
                await source.staff.resend(signIn.invitationId);
                notify(
                    'success',
                    t('admin.doctor.signIn.resent', { email: signIn.email }),
                );
            } else {
                await source.staff.revoke(signIn.invitationId);
                notify('success', t('admin.doctor.signIn.revoked'));
            }

            onChanged();
        } catch (caught) {
            notify('error', message(caught));
        } finally {
            setBusy(null);
        }
    };

    const spinner = (
        <Loader2
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
        />
    );

    return (
        <Card
            aria-labelledby="sign-in-access"
            className="flex animate-rise flex-col gap-4 p-6 motion-reduce:animate-none"
        >
            <div className="flex flex-col gap-1">
                <CardTitle id="sign-in-access">
                    {t('admin.doctor.signIn.title')}
                </CardTitle>
                <p className="text-control">{t('admin.doctor.signIn.lead')}</p>
            </div>

            {doctorId === null ? (
                <p className="text-control text-subtle">
                    {t('admin.doctor.signIn.saveFirst')}
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        {tone && (
                            <StatusPill tone={tone}>{pillLabel}</StatusPill>
                        )}
                        <span className="text-control text-ink">{status}</span>
                    </div>

                    {(signIn.state === 'invited' ||
                        signIn.state === 'expired') && (
                        <div className="flex flex-wrap gap-2.5">
                            <Button
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() => again('resend')}
                            >
                                {busy === 'resend' && spinner}
                                {t('admin.doctor.signIn.resend')}
                            </Button>
                            <Button
                                variant="outline-destructive"
                                disabled={busy !== null}
                                onClick={() => again('revoke')}
                            >
                                {busy === 'revoke' && spinner}
                                {t('admin.doctor.signIn.revoke')}
                            </Button>
                        </div>
                    )}

                    {signIn.state === 'none' && (
                        <form
                            onSubmit={invite}
                            noValidate
                            className="flex flex-wrap items-end gap-3"
                        >
                            <FormField
                                label={t('admin.doctor.signIn.email')}
                                error={error || undefined}
                                className="min-w-[240px] flex-[1_1_280px]"
                            >
                                {(control) => (
                                    <Input
                                        {...control}
                                        type="email"
                                        dir="ltr"
                                        autoComplete="off"
                                        placeholder="name@yourclinic.com"
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                            setError('');
                                        }}
                                    />
                                )}
                            </FormField>
                            <Button
                                type="submit"
                                variant="outline"
                                className="border-brand text-brand-deep"
                                disabled={busy !== null}
                            >
                                {busy === 'invite' && spinner}
                                {t('admin.doctor.signIn.invite')}
                            </Button>
                        </form>
                    )}
                </>
            )}
        </Card>
    );
}
