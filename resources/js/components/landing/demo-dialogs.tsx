import { Loader2, Play } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Placeholders } from '@/components/public/placeholders';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { TextField } from '@/components/vocamed/form-fields';
import { useT } from '@/i18n/scope';
import { auth, type AuthSource } from '@/lib/data';

/** "Watch the 15-second demo": there is no clip yet, so this says so plainly with a bracketed stand-in. */
export function WatchDemoDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t, locale, dir } = useT();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={dir}
                lang={locale}
                className="max-w-[560px] sm:max-w-[560px]"
            >
                <DialogTitle>{t('landing.watch.title')}</DialogTitle>
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-line-dashed bg-surface-subtle text-center">
                    <span className="flex flex-col items-center gap-2 px-6 text-control text-copy">
                        <Play
                            aria-hidden="true"
                            className="size-8 text-subtle"
                        />
                        <Placeholders>{t('landing.watch.clip')}</Placeholders>
                    </span>
                </div>
                <DialogDescription>{t('landing.watch.note')}</DialogDescription>
                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {t('landing.watch.close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * "Request a demo". It collects name, clinic and contact, but nothing is sent anywhere until
 * you decide where requests go, and the dialog says so both before and after submitting.
 */
export function RequestDemoDialog({
    open,
    onOpenChange,
    source = auth,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    source?: AuthSource;
}) {
    const { t, locale, dir } = useT();
    const [name, setName] = useState('');
    const [clinic, setClinic] = useState('');
    const [contact, setContact] = useState('');
    const [missing, setMissing] = useState(false);
    const [phase, setPhase] = useState<'idle' | 'submitting' | 'sent'>('idle');

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (!name.trim() || !contact.trim()) {
            setMissing(true);

            return;
        }

        setMissing(false);
        setPhase('submitting');
        await source.requestDemo({ name, clinic, contact });
        setPhase('sent');
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);

                if (!next) {
                    setPhase('idle');
                }
            }}
        >
            <DialogContent
                dir={dir}
                lang={locale}
                className="max-w-[480px] sm:max-w-[480px]"
            >
                <DialogTitle>
                    {phase === 'sent'
                        ? t('landing.request.sentTitle')
                        : t('landing.request.title')}
                </DialogTitle>

                {phase === 'sent' ? (
                    <>
                        <DialogDescription>
                            {t('landing.request.sentText')}
                        </DialogDescription>
                        <div className="flex justify-end">
                            <Button onClick={() => onOpenChange(false)}>
                                {t('landing.request.close')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogDescription>
                            {t('landing.request.lead')}
                        </DialogDescription>
                        <form
                            onSubmit={submit}
                            noValidate
                            className="flex flex-col gap-4"
                        >
                            <TextField
                                label={t('landing.request.name')}
                                autoComplete="name"
                                value={name}
                                error={
                                    missing && !name.trim()
                                        ? t('auth.errors.required')
                                        : undefined
                                }
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                            <TextField
                                label={t('landing.request.clinic')}
                                optional
                                autoComplete="organization"
                                value={clinic}
                                onChange={(event) =>
                                    setClinic(event.target.value)
                                }
                            />
                            <TextField
                                label={t('landing.request.contact')}
                                dir="ltr"
                                autoComplete="email"
                                value={contact}
                                error={
                                    missing && !contact.trim()
                                        ? t('auth.errors.required')
                                        : undefined
                                }
                                onChange={(event) =>
                                    setContact(event.target.value)
                                }
                            />
                            <p className="rounded-md bg-warning-surface px-3 py-2 text-small text-warning-ink">
                                {t('landing.request.placeholder')}
                            </p>
                            <Button
                                type="submit"
                                size="lg"
                                aria-busy={phase === 'submitting'}
                            >
                                {phase === 'submitting' && (
                                    <Loader2
                                        aria-hidden="true"
                                        className="animate-spin"
                                    />
                                )}
                                {t('landing.request.submit')}
                            </Button>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
