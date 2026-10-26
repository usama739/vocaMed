import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChangedKeys } from './use-changed-keys';

type Row = { id: string; status: string };
const key = (r: Row) => r.id;
const signature = (r: Row) => r.status;

describe('useChangedKeys', () => {
    it('flags nothing on the first load', () => {
        const { result } = renderHook(() =>
            useChangedKeys([{ id: 'a', status: 'booked' }], key, signature),
        );

        expect(result.current.size).toBe(0);
    });

    it('flags a row whose status changed, then lets go of it', async () => {
        const { result, rerender } = renderHook(
            ({ rows }: { rows: Row[] }) =>
                useChangedKeys(rows, key, signature, 30),
            {
                initialProps: {
                    rows: [
                        { id: 'a', status: 'booked' },
                        { id: 'b', status: 'booked' },
                    ],
                },
            },
        );

        rerender({
            rows: [
                { id: 'a', status: 'arrived' },
                { id: 'b', status: 'booked' },
            ],
        });

        expect([...result.current]).toEqual(['a']);
        await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
        expect(result.current.size).toBe(0);
    });

    it('does not flag a row that is new', () => {
        const { result, rerender } = renderHook(
            ({ rows }: { rows: Row[] }) => useChangedKeys(rows, key, signature),
            { initialProps: { rows: [{ id: 'a', status: 'booked' }] } },
        );

        rerender({
            rows: [
                { id: 'a', status: 'booked' },
                { id: 'b', status: 'booked' },
            ],
        });

        expect(result.current.size).toBe(0);
    });
});
