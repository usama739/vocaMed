import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    ReceptionRuntimeContext,
    type ForcedState,
} from '@/components/reception/runtime';
import { DataSourceProvider } from '@/hooks/use-data';
import { fakeRuntime, receptionSource } from '@/test/reception';
import { useLiveQuery } from './use-live-query';

function wrapper(forced: ForcedState | null = null, epoch = 0) {
    const { source } = receptionSource();

    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <DataSourceProvider source={source}>
                <ReceptionRuntimeContext.Provider
                    value={fakeRuntime({ forced, epoch })}
                >
                    {children}
                </ReceptionRuntimeContext.Provider>
            </DataSourceProvider>
        );
    };
}

describe('useLiveQuery', () => {
    it('goes from loading to ready with the loaded data', async () => {
        const { result } = renderHook(
            () =>
                useLiveQuery('clinic', (s) => s.clinic.get(), { refreshMs: 0 }),
            { wrapper: wrapper() },
        );

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.data?.name).toBe('Shifa Family Clinic');
    });

    it('reports a failed first load as an error, and Retry loads again', async () => {
        let calls = 0;
        const { result } = renderHook(
            () =>
                useLiveQuery(
                    'flaky',
                    async () => {
                        calls += 1;

                        if (calls === 1) {
                            throw new Error('offline');
                        }

                        return 'ok';
                    },
                    { refreshMs: 0 },
                ),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('error'));
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.data).toBe('ok');
    });

    it('keeps the old data when a refresh fails', async () => {
        let calls = 0;
        const { result } = renderHook(
            () =>
                useLiveQuery(
                    'refresh',
                    async () => {
                        calls += 1;

                        if (calls > 1) {
                            throw new Error('offline');
                        }

                        return 'first';
                    },
                    { refreshMs: 0 },
                ),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.data).toBe('first'));
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.stale).toBe(true));
        expect(result.current.status).toBe('ready');
        expect(result.current.data).toBe('first');
    });

    it('polls for fresh data', async () => {
        const load = vi.fn(async () => Math.random());
        renderHook(() => useLiveQuery('poll', load, { refreshMs: 20 }), {
            wrapper: wrapper(),
        });

        await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(2));
    });

    it('can be forced into the loading, error and empty states', async () => {
        const loading = renderHook(
            () => useLiveQuery('a', async () => [1, 2], { empty: [] }),
            { wrapper: wrapper('loading') },
        );
        expect(loading.result.current.status).toBe('loading');

        const error = renderHook(
            () => useLiveQuery('b', async () => [1, 2], { empty: [] }),
            { wrapper: wrapper('error') },
        );
        expect(error.result.current.status).toBe('error');

        const empty = renderHook(
            () => useLiveQuery('c', async () => [1, 2], { empty: [] }),
            { wrapper: wrapper('empty') },
        );
        expect(empty.result.current.data).toEqual([]);
    });

    it('does not show another key’s data as current unless asked to', async () => {
        const { result, rerender } = renderHook(
            ({ id, keep }: { id: string; keep: boolean }) =>
                useLiveQuery(
                    `row:${id}`,
                    async () => {
                        await new Promise((r) => setTimeout(r, 30));

                        return id;
                    },
                    { refreshMs: 0, keepPrevious: keep },
                ),
            { wrapper: wrapper(), initialProps: { id: 'a', keep: false } },
        );

        await waitFor(() => expect(result.current.data).toBe('a'));
        rerender({ id: 'b', keep: false });
        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.data).toBe('b'));

        rerender({ id: 'c', keep: true });
        expect(result.current.data).toBe('b');
    });
});
