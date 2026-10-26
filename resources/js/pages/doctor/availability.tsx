import { Head } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { AvailabilityEditor } from '@/components/availability/availability-editor';
import { useAvailabilityEditor } from '@/components/availability/use-availability-editor';
import {
    PageBody,
    PageError,
    PageHeader,
    PageLoading,
    SampleNote,
} from '@/components/reception/page-parts';
import { Button } from '@/components/ui/button';
import { notify } from '@/components/vocamed/toast';
import { useData } from '@/hooks/use-data';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useView } from '@/hooks/use-view';
import { useT } from '@/i18n/scope';

export default function Availability() {
    const { t } = useT();
    const source = useData();
    const query = useView('availability', undefined, { refreshMs: 0 });
    const view = query.data;
    const editor = useAvailabilityEditor(view);
    const [saving, setSaving] = useState(false);

    useLeaveGuard(editor.dirty, t('doctor.availability.leave'));

    const save = async () => {
        if (!editor.draft) {
            return;
        }

        setSaving(true);

        try {
            await source.doctors.saveAvailability(editor.draft);
            editor.markSaved();
            notify('success', t('doctor.availability.saved'));
            query.reload();
        } catch {
            notify('error', t('doctor.availability.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Head title={t('doctor.availability.title')} />
            <PageBody>
                <PageHeader
                    title={t('doctor.availability.title')}
                    lead={t('doctor.availability.sub')}
                    actions={
                        <>
                            {editor.dirty && (
                                <span
                                    role="status"
                                    className="animate-fade text-label font-semibold text-warning-ink motion-reduce:animate-none"
                                >
                                    {t('doctor.availability.unsaved')}
                                </span>
                            )}
                            <Button
                                disabled={!editor.dirty || saving}
                                onClick={save}
                            >
                                {saving && (
                                    <Loader2
                                        aria-hidden="true"
                                        className="animate-spin motion-reduce:animate-none"
                                    />
                                )}
                                {editor.affected.length > 0
                                    ? t('doctor.availability.saveAnyway')
                                    : t('doctor.availability.save')}
                            </Button>
                        </>
                    }
                />

                {query.status === 'loading' && (
                    <PageLoading
                        label={t('doctor.loading')}
                        blocks={[64, 480, 200]}
                    />
                )}
                {query.status === 'error' && (
                    <PageError onRetry={query.reload} />
                )}

                {query.status === 'ready' && view && editor.draft && (
                    <AvailabilityEditor
                        editor={editor}
                        timezone={view.clinic.timezone}
                    />
                )}

                <SampleNote />
            </PageBody>
        </>
    );
}
