import { CircleCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/scope';

/**
 * The bar at the bottom of a long form (Doctor profile, Clinic settings): the unsaved note,
 * "saved" confirmation, Discard and Save. Both buttons wait until there is something to save.
 */
export function SaveBar({
    dirty,
    saving,
    saved,
    onSave,
    onDiscard,
    saveLabel,
    savedLabel,
}: {
    dirty: boolean;
    saving: boolean;
    /** Show the "saved" confirmation (until the next edit). */
    saved?: boolean;
    onSave: () => void;
    onDiscard: () => void;
    saveLabel: string;
    savedLabel: string;
}) {
    const { t } = useT();

    return (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft pt-3.5">
            {dirty && (
                <span
                    role="status"
                    className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                >
                    {t('admin.common.unsaved')}
                </span>
            )}
            {!dirty && saved && (
                <span
                    role="status"
                    className="inline-flex animate-fade items-center gap-2 text-label font-semibold text-[#14532d] motion-reduce:animate-none"
                >
                    <CircleCheck aria-hidden="true" className="size-[18px]" />
                    {savedLabel}
                </span>
            )}
            <Button
                variant="outline"

                disabled={!dirty || saving}
                onClick={onDiscard}
            >
                {t('admin.common.discard')}
            </Button>
            <Button disabled={!dirty || saving} onClick={onSave}>
                {saving && (
                    <Loader2
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
                    />
                )}
                {saveLabel}
            </Button>
        </div>
    );
}
