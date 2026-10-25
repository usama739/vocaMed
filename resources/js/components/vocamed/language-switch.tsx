import { useLocale } from '@/hooks/use-locale';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { useT } from '@/i18n/scope';
import { cn } from '@/lib/utils';

/**
 * English / اردو segmented switch. Each name is written in its own language, so it is
 * readable whichever language is active. Uses the server-persisted locale unless a
 * controlled `onChange` is given.
 */
export function LanguageSwitch({
    onChange,
    className,
}: {
    onChange?: (locale: Locale) => void;
    className?: string;
}) {
    const { t, locale } = useT();
    const { setLocale } = useLocale();

    return (
        <div
            role="group"
            aria-label={t('common.language')}
            className={cn(
                'inline-flex rounded-md border border-line bg-surface-subtle p-0.5',
                className,
            )}
        >
            {LOCALES.map((code) => {
                const on = code === locale;

                return (
                    <button
                        key={code}
                        type="button"
                        lang={code}
                        aria-pressed={on}
                        onClick={() => (onChange ?? setLocale)(code)}
                        className={cn(
                            'inline-flex h-11 min-w-16 items-center justify-center rounded-sm px-3.5 text-label font-semibold',
                            on
                                ? 'bg-brand-tint text-brand-deep'
                                : 'text-copy hover:bg-surface-hover',
                        )}
                    >
                        {LOCALE_NAMES[code]}
                    </button>
                );
            })}
        </div>
    );
}
