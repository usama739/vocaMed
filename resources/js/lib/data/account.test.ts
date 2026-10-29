// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSource } from './account';
import { SAMPLE_PASSWORD } from './auth-mock';
import { createMockAccounts } from './mock-account';
import { createSessionUserStore } from './session-user';
import { createSeedDatabase, type MockDatabase } from './seed';

const NOW = new Date('2026-10-26T05:15:00.000Z');

let db: MockDatabase;
let accountFor: (userId: string) => AccountSource;
let changed: number;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = createSeedDatabase(NOW);
    changed = 0;
    accountFor = createMockAccounts(db, {
        now: () => new Date(),
        initialPassword: SAMPLE_PASSWORD,
        onChange: () => (changed += 1),
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('the account of each person', () => {
    it('shows only their own details, choices and sessions', async () => {
        const admin = await accountFor('u_admin').views.account();
        const doctor = await accountFor('u_doc1').views.account();

        expect(admin.user).toEqual({
            id: 'u_admin',
            name: 'Ayesha Khan',
            email: 'ayesha@shifa.example',
            role: 'clinic_admin',
            locale: 'en',
        });
        expect(doctor.user).toMatchObject({
            name: 'Dr. Sana Malik',
            role: 'doctor',
        });
        expect(admin.notifications).toEqual({
            failedReminders: true,
            patientCancellations: true,
            dailySummary: false,
        });
        expect(admin.otherSessions).toBe(2);
    });

    it('has a person who does not exist refused', async () => {
        await expect(
            accountFor('nobody').views.account(),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
});

describe('the profile', () => {
    it('saves the name and language, and says so to anyone showing the person', async () => {
        const source = accountFor('u_recep');
        const saved = await source.saveProfile({
            name: '  Bilal A. Ahmed ',
            locale: 'en',
        });

        expect(saved).toMatchObject({ name: 'Bilal A. Ahmed', locale: 'en' });
        expect(db.users.find((u) => u.id === 'u_recep')?.name).toBe(
            'Bilal A. Ahmed',
        );
        expect((await source.views.account()).user.locale).toBe('en');
        expect(changed).toBe(1);
    });

    it('needs a name of at most 120 characters', async () => {
        const source = accountFor('u_recep');

        await expect(
            source.saveProfile({ name: '   ', locale: 'ur' }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'name' });
        await expect(
            source.saveProfile({ name: 'x'.repeat(121), locale: 'ur' }),
        ).rejects.toMatchObject({ field: 'name' });
        expect(changed).toBe(0);
    });
});

describe('the password', () => {
    const good = {
        current: SAMPLE_PASSWORD,
        password: 'Better-pass-2026',
        confirm: 'Better-pass-2026',
    };

    it('changes with the right current password, and ends the other sessions', async () => {
        const source = accountFor('u_admin');

        await expect(source.changePassword(good)).resolves.toBeUndefined();
        expect((await source.views.account()).otherSessions).toBe(0);
        // The new password is now the current one.
        await expect(
            source.changePassword({ ...good, current: SAMPLE_PASSWORD }),
        ).rejects.toMatchObject({ code: 'INVALID_PASSWORD', field: 'current' });
        await expect(
            source.changePassword({
                current: good.password,
                password: 'Another-pass-1234',
                confirm: 'Another-pass-1234',
            }),
        ).resolves.toBeUndefined();
    });

    it('refuses a wrong current password, naming the field', async () => {
        await expect(
            accountFor('u_admin').changePassword({ ...good, current: 'nope' }),
        ).rejects.toMatchObject({ code: 'INVALID_PASSWORD', field: 'current' });
    });

    it('refuses a weak new password and a confirmation that does not match', async () => {
        const source = accountFor('u_admin');

        await expect(
            source.changePassword({
                ...good,
                password: 'short1',
                confirm: 'short1',
            }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'password' });
        await expect(
            source.changePassword({
                ...good,
                password: 'onlyletterslong',
                confirm: 'onlyletterslong',
            }),
        ).rejects.toMatchObject({ field: 'password' });
        await expect(
            source.changePassword({ ...good, confirm: 'Different-pass-1' }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'confirm' });
        // Nothing changed: the sessions are still there.
        expect((await source.views.account()).otherSessions).toBe(2);
    });

    it('limits wrong tries to six a minute, then lets the person try again', async () => {
        const source = accountFor('u_admin');

        for (let i = 0; i < 6; i++) {
            await expect(
                source.changePassword({ ...good, current: 'nope' }),
            ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
        }

        await expect(source.changePassword(good)).rejects.toMatchObject({
            code: 'RATE_LIMITED',
        });

        vi.setSystemTime(new Date(NOW.getTime() + 61_000));
        await expect(source.changePassword(good)).resolves.toBeUndefined();
    });

    it('keeps each person’s password to themselves', async () => {
        await accountFor('u_admin').changePassword(good);

        await expect(
            accountFor('u_recep').changePassword({
                current: SAMPLE_PASSWORD,
                password: 'Receptionist-1234',
                confirm: 'Receptionist-1234',
            }),
        ).resolves.toBeUndefined();
    });
});

describe('notification choices', () => {
    it('saves each one, for that person only', async () => {
        const admin = accountFor('u_admin');
        await admin.setNotification('dailySummary', true);
        await admin.setNotification('failedReminders', false);

        expect((await admin.views.account()).notifications).toEqual({
            failedReminders: false,
            patientCancellations: true,
            dailySummary: true,
        });
        expect(
            (await accountFor('u_recep').views.account()).notifications
                .dailySummary,
        ).toBe(false);
    });
});

describe('other sessions', () => {
    it('are signed out with the password, and counted', async () => {
        const source = accountFor('u_admin');

        await expect(
            source.signOutOthers({ password: SAMPLE_PASSWORD }),
        ).resolves.toEqual({ ended: 2 });
        expect((await source.views.account()).otherSessions).toBe(0);
        await expect(
            source.signOutOthers({ password: SAMPLE_PASSWORD }),
        ).resolves.toEqual({ ended: 0 });
    });

    it('need the right password', async () => {
        const source = accountFor('u_admin');

        await expect(
            source.signOutOthers({ password: 'nope' }),
        ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
        expect((await source.views.account()).otherSessions).toBe(2);
    });
});

describe('the signed-in person in the shell', () => {
    const SAMPLE = {
        clinic_admin: 'u_admin',
        receptionist: 'u_recep',
        doctor: 'u_doc1',
    } as const;

    it('gives a stable object until something changes, and tells listeners', async () => {
        const store = createSessionUserStore(db, SAMPLE);
        const listener = vi.fn();
        const stop = store.subscribe(listener);

        const first = store.get('doctor');
        expect(store.get('doctor')).toBe(first);

        db.users.find((u) => u.id === 'u_doc1')!.name = 'Dr. S. Malik';
        store.notify();
        expect(listener).toHaveBeenCalledTimes(1);
        const next = store.get('doctor');
        expect(next).not.toBe(first);
        expect(next.name).toBe('Dr. S. Malik');

        stop();
        store.notify();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
