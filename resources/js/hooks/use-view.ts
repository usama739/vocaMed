import {
    useLiveQuery,
    type LiveOptions,
    type LiveStatus,
} from '@/hooks/use-live-query';
import type { ViewSource } from '@/lib/data';
import { VIEW_LIVE } from '@/lib/live-topics';

export type ViewParams<K extends keyof ViewSource> = Parameters<
    ViewSource[K]
>[0];
export type ViewData<K extends keyof ViewSource> = Awaited<
    ReturnType<ViewSource[K]>
>;

/**
 * Loads one page read model (see `lib/data/views`) and keeps it fresh: on a timer and, with the
 * live line up, when the server announces a change to what the page shows (see `lib/live-topics`).
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
        {
            topics: VIEW_LIVE[name]?.topics,
            debounceMs: VIEW_LIVE[name]?.debounceMs,
            ...options,
        },
    );
}
