import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceptionRuntimeContext } from '@/components/reception/runtime';
import { DataSourceProvider } from '@/hooks/use-data';
import { emitLive, setLiveStatus } from '@/lib/live';
import { fakeRuntime, receptionSource } from '@/test/reception';
import { useAsyncValue } from './use-async-value';
import { LIVE_SAFETY_MS, useLiveQuery } from './use-live-query';

function wrapper() {
    const { source } = receptionSource();

    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <DataSourceProvider source={source}>
                <ReceptionRuntimeContext.Provider value={fakeRuntime({})}>
                    {children}
                </ReceptionRuntimeContext.Provider>
            </DataSourceProvider>
        );
    };
}

/** A loader that counts how many times the page read its data. */
function counter() {
    const calls = { n: 0 };

    return {
        calls,
        load: async () => {
            calls.n += 1;

            return calls.n;
        },
    };
}

describe('live updates in useLiveQuery', () => {
    afterEach(() => {
        setLiveStatus('off');
        vi.useRealTimers();
    });

    it('reads again when the server announces a topic the page shows', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(
            () =>
                useLiveQuery('a', load, {
                    topics: ['appointments'],
                    debounceMs: 10,
                }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(calls.n).toBe(1);

        act(() => emitLive('appointments'));

        await waitFor(() => expect(calls.n).toBe(2));
        await waitFor(() => expect(result.current.data).toBe(2));
    });

    it('ignores topics the page does not show', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(
            () =>
                useLiveQuery('b', load, {
                    topics: ['appointments'],
                    debounceMs: 10,
                }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('ready'));

        act(() => emitLive('audit'));
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(calls.n).toBe(1);
    });

    it('reads once for a burst of announcements', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(
            () =>
                useLiveQuery('c', load, {
                    topics: ['appointments', 'messages'],
                    debounceMs: 30,
                }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('ready'));

        act(() => {
            emitLive('appointments');
            emitLive('messages');
            emitLive('appointments');
        });

        await waitFor(() => expect(calls.n).toBe(2));
        await new Promise((resolve) => setTimeout(resolve, 80));

        expect(calls.n).toBe(2);
    });

    it('does not listen when the page never refreshes (a form it must not rewrite)', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(
            () =>
                useLiveQuery('d', load, {
                    refreshMs: 0,
                    topics: ['directory'],
                    debounceMs: 10,
                }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('ready'));

        act(() => emitLive('directory'));
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(calls.n).toBe(1);
    });

    it('slows its timer to a safety net while the live line is up, and goes back to it when the line drops', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { calls, load } = counter();
        const { result } = renderHook(
            () =>
                useLiveQuery('e', load, {
                    refreshMs: 5000,
                    topics: ['appointments'],
                }),
            { wrapper: wrapper() },
        );

        await waitFor(() => expect(result.current.status).toBe('ready'));
        act(() => setLiveStatus('connected'));
        const before = calls.n;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(calls.n).toBe(before);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(LIVE_SAFETY_MS);
        });
        expect(calls.n).toBeGreaterThan(before);

        act(() => setLiveStatus('down'));
        const afterDrop = calls.n;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(calls.n).toBeGreaterThan(afterDrop);
    });
});

describe('live updates in useAsyncValue', () => {
    afterEach(() => setLiveStatus('off'));

    beforeEach(() => setLiveStatus('off'));

    it('reads again on a topic when it refreshes at all', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(() =>
            useAsyncValue('slots', load, {
                refreshMs: 5000,
                topics: ['slots'],
                debounceMs: 10,
            }),
        );

        await waitFor(() => expect(result.current.value).toBe(1));

        act(() => emitLive('slots'));

        await waitFor(() => expect(calls.n).toBe(2));
    });

    it('does not listen when it was not asked to refresh', async () => {
        const { calls, load } = counter();
        const { result } = renderHook(() =>
            useAsyncValue('once', load, { topics: ['slots'], debounceMs: 10 }),
        );

        await waitFor(() => expect(result.current.value).toBe(1));

        act(() => emitLive('slots'));
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(calls.n).toBe(1);
    });
});
