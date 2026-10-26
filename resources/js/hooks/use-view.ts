import {
    useLiveQuery,
    type LiveOptions,
    type LiveStatus,
} from '@/hooks/use-live-query';
import type { ViewSource } from '@/lib/data';

export type ViewParams<K extends keyof ViewSource> = Parameters<
    ViewSource[K]
>[0];
export type ViewData<K extends keyof ViewSource> = Awaited<
    ReturnType<ViewSource[K]>
>;

/**
 * Loads one page read model (see `lib/data/views`) and keeps it fresh. This hook is the seam
 * for the backend: with Inertia it reads the page props and refreshes with a partial reload
 * (`router.reload({ only })`), driven by Reverb instead of the timer. Pages do not change.
 */
export function useView<K extends keyof ViewSource>(
    name: K,
    params: ViewParams<K>,
    options: LiveOptions<ViewData<K>> = {},
): {
    data: ViewData<K> | undefined;
    status: LiveStatus;
    reload: () => void;
    stale: boolean;
} {
    return useLiveQuery<ViewData<K>>(
        `${name}:${JSON.stringify(params ?? null)}`,
        (source) =>
            (
                source.views[name] as (
                    params: ViewParams<K>,
                ) => Promise<ViewData<K>>
            )(params),
        options,
    );
}
