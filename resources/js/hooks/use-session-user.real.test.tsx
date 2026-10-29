import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let props: Record<string, unknown> = {};

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props }),
}));

const load = async () => {
    vi.resetModules();

    return import('./use-session-user');
};

describe('the session hooks with the real backend', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_REAL_AUTH', 'true');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('read the signed-in person and their clinic from the shared auth prop', async () => {
        props = {
            auth: {
                user: {
                    id: '7',
                    name: 'Dr Noor',
                    email: 'noor@example.test',
                    role: 'doctor',
                    locale: 'en',
                },
                clinic: { name: 'Noor Clinic' },
            },
        };
        const { useSessionUser, useSessionRole, useClinicName } = await load();

        expect(
            renderHook(() => useSessionUser('clinic_admin')).result.current,
        ).toMatchObject({ name: 'Dr Noor', role: 'doctor' });
        expect(renderHook(() => useSessionRole()).result.current).toBe(
            'doctor',
        );
        expect(renderHook(() => useClinicName()).result.current).toBe(
            'Noor Clinic',
        );
    });

    it('do not break when nobody is signed in', async () => {
        props = { auth: { user: null, clinic: null } };
        const { useSessionUser, useClinicName } = await load();

        expect(renderHook(() => useSessionUser()).result.current.name).toBe('');
        expect(renderHook(() => useClinicName()).result.current).toBe(
            undefined,
        );
    });
});

describe('the session hooks in the demo', () => {
    it('keep using the sample user and the default clinic name', async () => {
        vi.stubEnv('VITE_REAL_AUTH', 'false');
        props = {};
        const { useSessionUser, useClinicName } = await load();

        expect(
            renderHook(() => useSessionUser('doctor')).result.current.role,
        ).toBe('doctor');
        expect(renderHook(() => useClinicName()).result.current).toBe(
            undefined,
        );
        vi.unstubAllEnvs();
    });
});
