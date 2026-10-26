import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '@/hooks/use-data';
import type { AvailabilityDraft, AvailabilityPreview, Id } from '@/lib/data';

const keyOf = (draft: AvailabilityDraft | null | undefined) =>
    JSON.stringify(draft ?? null);

/**
 * The state behind the availability editor, shared by the doctor's own page and the admin's
 * doctor profile. The page edits its own copy of the saved draft; a reload only replaces it when
 * nothing was edited. The slot rules live on the server, so the preview is asked for (debounced)
 * as the draft changes.
 */
export function useAvailabilityEditor(
    view:
        { draft: AvailabilityDraft; preview: AvailabilityPreview } | undefined,
    /** The admin names the doctor (`'new'` for one not created yet); a doctor omits it. */
    doctorId?: Id | 'new',
) {
    const source = useData();
    const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
    // The saved draft the form started from, so a reload can tell whether anything was edited.
    const base = useRef<AvailabilityDraft | null>(null);
    const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [justSaved, setJustSaved] = useState<string | null>(null);

    const savedKey = justSaved ?? keyOf(view?.draft);

    useEffect(() => {
        if (!view) {
            return;
        }

        const previous = base.current;
        base.current = view.draft;
        setDraft((current) =>
            current === null || keyOf(current) === keyOf(previous)
                ? view.draft
                : current,
        );
        setJustSaved(null);
    }, [view]);

    const dirty = draft !== null && keyOf(draft) !== savedKey;

    useEffect(() => {
        if (!draft || !view) {
            return;
        }

        if (!dirty) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreview(view.preview);

            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            setPreviewing(true);

            try {
                const next = await source.doctors.previewAvailability(
                    draft,
                    doctorId,
                );

                if (!cancelled) {
                    setPreview(next);
                }
            } catch {
                // Keep the last preview; saving will report a real problem.
            } finally {
                if (!cancelled) {
                    setPreviewing(false);
                }
            }
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [draft, dirty, view, source, doctorId]);

    /** Call after a successful save: the current draft is now the saved one. */
    const markSaved = useCallback(() => setJustSaved(keyOf(draft)), [draft]);

    /** Throw the edits away and go back to the saved draft. */
    const discard = useCallback(() => {
        if (view) {
            setDraft(view.draft);
            setJustSaved(null);
        }
    }, [view]);

    return {
        draft,
        setDraft,
        dirty,
        preview,
        previewing,
        affected: preview?.affected ?? [],
        markSaved,
        discard,
    };
}

export type AvailabilityEditorState = ReturnType<typeof useAvailabilityEditor>;
