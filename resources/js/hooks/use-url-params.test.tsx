import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUrlParams } from './use-url-params';

const DEFAULTS = { q: '', status: 'all', page: '1' };

beforeEach(() => {
    window.history.replaceState(null, '', '/reception/appointments');
});

describe('useUrlParams', () => {
    it('starts from the address, falling back to the defaults', () => {
        window.history.replaceState(null, '', '/x?status=done&page=3');
        const { result } = renderHook(() => useUrlParams(DEFAULTS));

        expect(result.current[0]).toEqual({ q: '', status: 'done', page: '3' });
    });

    it('writes changes to the address without adding history entries', () => {
        const before = window.history.length;
        const { result } = renderHook(() => useUrlParams(DEFAULTS));

        act(() => result.current[1]({ status: 'cancelled', page: '2' }));

        expect(window.location.search).toBe('?status=cancelled&page=2');
        expect(result.current[0].status).toBe('cancelled');
        expect(window.history.length).toBe(before);
    });

    it('leaves a value out of the address once it is back at its default', () => {
        const { result } = renderHook(() => useUrlParams(DEFAULTS));

        act(() => result.current[1]({ status: 'done' }));
        act(() => result.current[1]({ status: 'all' }));

        expect(window.location.search).toBe('');
    });

    it('keeps parameters it does not own, such as ?state=', () => {
        window.history.replaceState(null, '', '/x?state=loading');
        const { result } = renderHook(() => useUrlParams(DEFAULTS));

        act(() => result.current[1]({ q: 'zainab' }));

        expect(window.location.search).toContain('state=loading');
        expect(window.location.search).toContain('q=zainab');
    });
});
