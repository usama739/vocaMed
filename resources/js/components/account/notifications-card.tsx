import { CircleCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/reception/page-parts';
import { ToggleSwitch } from '@/components/vocamed/toggle-switch';
import { useAccountSource } from '@/hooks/use-account';
import { useT } from '@/i18n/scope';
import type { NotificationKey } from '@/lib/data';

const KEYS: NotificationKey[] = [
    'failedReminders',
    'patientCancellations',
    'dailySummary',
];

/**
 * Three email choices. Each saves the moment it is flipped; if the server refuses, the switch goes
 * back and says so. In-app alerts always show whatever is chosen here.
 */
export function NotificationsCard({
    initial,
}: {
    initial: Record<NotificationKey, boolean>;
}) {
    const { t } = useT();
    const source = useAccountSource();
    const [values, setValues] = useState(initial);
    const [saving, setSaving] = useState<NotificationKey | null>(null);
    const [message, setMessage] = useState<'saved' | 'failed' | null>(null);
    const timer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const flip = async (key: NotificationKey, on: boolean) => {
        setValues((v) => ({ ...v, [key]: on }));
        setSaving(key);
        setMessage(null);
        window.clearTimeout(timer.current);

        try {
            await source.setNotification(key, on);
            setMessage('saved');
            timer.current = window.setTimeout(() => setMessage(null), 3000);
        } catch {
            setValues((v) => ({ ...v, [key]: !on }));
            setMessage('failed');
        } finally {
            setSaving(null);
        }
    };

    return (
        <Card
            aria-labelledby="account-notifications"
            className="flex animate-rise flex-col gap-3 p-6 [animation-delay:120ms] motion-reduce:animate-none"
        >
            <div className="flex flex-col gap-1">
                <CardTitle id="account-notifications">
                    {t('account.notifications.title')}
                </CardTitle>
                <p className="text-[14.5px]">
                    {t('account.notifications.sub')}
                </p>
            </div>
            <div className="flex flex-col">
                {KEYS.map((key) => (
                    <div
                        key={key}
                        className="flex items-center justify-between gap-4 border-b border-line-soft py-3 last:border-b-0"
                    >
                        <div className="flex min-w-0 flex-col">
                            <span
                                id={`account-n-${key}`}
                                className="text-control font-semibold text-ink"
                            >
                                {t(`account.notifications.${key}.label`)}
                            </span>
                            <span className="text-label">
                                {t(`account.notifications.${key}.help`)}
                            </span>
                        </div>
                        <ToggleSwitch
                            checked={values[key]}
                            labelledBy={`account-n-${key}`}
                            disabled={saving === key}
                            onChange={(on) => flip(key, on)}
                        />
                    </div>
                ))}
            </div>
            <div className="min-h-6" role="status">
                {message === 'saved' && (
                    <span className="inline-flex animate-fade items-center gap-2 text-label font-semibold text-success-ink motion-reduce:animate-none">
                        <CircleCheck
                            aria-hidden="true"
                            className="size-[18px]"
                        />
                        {t('account.notifications.saved')}
                    </span>
                )}
                {message === 'failed' && (
                    <span className="text-label font-semibold text-danger-ink">
                        {t('account.notifications.failed')}
                    </span>
                )}
            </div>
        </Card>
    );
}
