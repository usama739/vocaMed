import { useT } from '@/i18n/scope';
import { passwordStrength } from '@/lib/validation';
import { cn } from '@/lib/utils';

const LABELS = [
    'auth.strength.empty',
    'auth.strength.weak',
    'auth.strength.fair',
    'auth.strength.strong',
] as const;

/**
 * Three segments that fill from the start edge (the right in Urdu) plus a text label.
 * The label is a polite live region, so it is read when the level changes, not on every key.
 */
export function PasswordStrength({ password }: { password: string }) {
    const { t } = useT();
    const level = passwordStrength(password);

    return (
        <div className="flex items-center gap-2.5">
            <div aria-hidden="true" className="grid flex-1 grid-cols-3 gap-1.5">
                {[1, 2, 3].map((segment) => (
                    <span
                        key={segment}
                        className="relative h-2 overflow-hidden rounded-[4px] bg-line"
                    >
                        <span
                            className={cn(
                                'absolute inset-0 origin-left rounded-[4px] bg-brand transition-transform duration-300 ease-out-soft rtl:origin-right',
                                level >= segment ? 'scale-x-100' : 'scale-x-0',
                            )}
                            style={{ transitionDelay: `${(segment - 1) * 60}ms` }}
                        />
                    </span>
                ))}
            </div>
            <span
                aria-live="polite"
                className="min-w-[84px] text-small font-semibold text-ink"
            >
                <span className="sr-only">{t('auth.strength.label')}: </span>
                {t(LABELS[level])}
            </span>
        </div>
    );
}
