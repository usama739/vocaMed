import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCountUp } from './use-count-up';

describe('useCountUp', () => {
    it('shows the value as it is on the first render', () => {
        const { result } = renderHook(() => useCountUp(7));

        expect(result.current).toBe(7);
    });

    it('settles on the new value (at once where motion is not available)', () => {
        const { result, rerender } = renderHook(
            ({ value }: { value: number }) => useCountUp(value),
            { initialProps: { value: 3 } },
        );

        rerender({ value: 9 });

        expect(result.current).toBe(9);
    });
});
