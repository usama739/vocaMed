// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from './mock';
import { createMockPatientLinks } from './mock-patient-links';
import { createSeedDatabase, DEMO_CLINIC_ID, type MockDatabase } from './seed';
import type { PatientLinkSource } from './source';

// Monday 10:15 in Karachi.
const NOW = new Date('2026-10-26T05:15:00.000Z');

let db: MockDatabase;
let links: PatientLinkSource;

const staff = () =>
    createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId: 'u_admin',
        now: () => new Date(),
    });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = createSeedDatabase(NOW);
    links = createMockPatientLinks(db, { now: () => new Date() });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('opening a link', () => {
    it('shows one appointment with only the patient’s first name', async () => {
        const view = await links.views.manage('sample-booked');

        expect(view).toMatchObject({
            state: 'valid',
            clinic: { name: 'Shifa Family Clinic', timezone: 'Asia/Karachi' },
            appointment: {
                firstName: 'Bilqees',
                doctorName: 'Dr. Imran Qureshi',
                serviceName: 'Follow-up visit',
                status: 'booked',
            },
            preferredLocale: 'ur',
        });
        // Nothing that identifies the patient further, and nothing else about the clinic's people.
        const json = JSON.stringify(view);
        expect(json).not.toContain('Bano');
        expect(json).not.toContain('+9234');
    });

    it('treats an unknown link as expired and names no clinic', async () => {
        for (const view of [
            await links.views.manage('sample-unknown'),
            await links.views.reschedule('x'),
            await links.views.status('x'),
            await links.views.expired('x'),
        ]) {
            expect(view).toEqual({ state: 'expired', clinic: null });
        }
    });

    it('treats an expired link as expired but names the clinic for the phone number', async () => {
        expect(await links.views.manage('sample-expired')).toEqual({
            state: 'expired',
            clinic: { name: 'Shifa Family Clinic', phone: '+922135001122' },
        });
    });

    it('expires a day after the visit ends', async () => {
        vi.setSystemTime(new Date(NOW.getTime() + 3 * 86_400_000));
        expect((await links.views.manage('sample-booked')).state).toBe(
            'expired',
        );
    });
});

describe('what the patient may do', () => {
    it('can confirm, move or cancel a booked appointment', async () => {
        const view = await links.views.manage('sample-booked');

        expect(view).toMatchObject({
            allowed: { confirm: true, reschedule: true, cancel: true },
            late: null,
            pendingRequest: false,
            cancellationWindowHours: 4,
        });
    });

    it('cannot confirm twice, and a confirmed appointment still moves or cancels', async () => {
        expect(await links.views.manage('sample-confirmed')).toMatchObject({
            appointment: { status: 'confirmed' },
            allowed: { confirm: false, reschedule: true, cancel: true },
        });
    });

    it('can do nothing with a cancelled appointment', async () => {
        expect(await links.views.manage('sample-cancelled')).toMatchObject({
            appointment: { status: 'cancelled' },
            allowed: { confirm: false, reschedule: false, cancel: false },
        });
    });

    it('cannot move or cancel inside the cancellation window, but can still confirm if it has not started', async () => {
        const view = await links.views.manage('sample-late');

        expect(view).toMatchObject({
            late: { deadline: expect.any(String) },
            allowed: { reschedule: false, cancel: false },
        });
        // Booked at 11:00 with a four-hour window: the window closed at 07:00.
        expect(view.state === 'valid' && view.late?.deadline).toBe(
            '2026-10-26T02:00:00.000Z',
        );
        await expect(links.cancel('sample-late')).rejects.toMatchObject({
            code: 'OUTSIDE_WINDOW',
        });
        await expect(
            links.reschedule('sample-late', '2026-10-27T05:00:00.000Z'),
        ).rejects.toMatchObject({ code: 'OUTSIDE_WINDOW' });
    });

    it('has no late window when the clinic sets no limit, until the visit starts', async () => {
        db.settings.find(
            (s) => s.clinicId === DEMO_CLINIC_ID,
        )!.cancellationWindowHours = null;

        // The 11:00 visit is 45 minutes away: still free to change.
        const before = await links.views.manage('sample-late');
        expect(before.state === 'valid' && before.late).toBeNull();
        expect(
            before.state === 'valid' && before.cancellationWindowHours,
        ).toBeNull();
        expect(before.state === 'valid' && before.allowed.cancel).toBe(true);

        // Once it has started, online changes stop.
        vi.setSystemTime(new Date('2026-10-26T06:30:00.000Z'));
        const after = await links.views.manage('sample-late');
        expect(after.state === 'valid' && after.late).not.toBeNull();
        expect(after.state === 'valid' && after.allowed.cancel).toBe(false);
    });

    it('hides reschedule while a request is waiting', async () => {
        expect(await links.views.manage('sample-pending')).toMatchObject({
            pendingRequest: true,
            allowed: { reschedule: false, cancel: true },
        });
        await expect(
            links.reschedule('sample-pending', '2026-10-27T05:00:00.000Z'),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('opens the queue page on the day of the visit only', async () => {
        const today = await links.views.manage('sample-notarrived');
        const later = await links.views.manage('sample-booked');

        expect(today.state === 'valid' && today.queueOpen).toBe(true);
        expect(later.state === 'valid' && later.queueOpen).toBe(false);
    });
});

describe('confirming and cancelling', () => {
    it('confirms, records it for reception, and answers the same the second time', async () => {
        await expect(links.confirm('sample-booked')).resolves.toEqual({
            status: 'confirmed',
        });
        await expect(links.confirm('sample-booked')).resolves.toEqual({
            status: 'confirmed',
        });

        const replies = db.replies.filter((r) => r.appointmentId === 'a_007');
        expect(replies.map((r) => r.action)).toEqual(['confirm']);
        expect(db.audit[0]).toMatchObject({
            action: 'appointment.status_changed',
            actorId: 'patient',
            meta: { status: 'confirmed' },
        });
        // Reception sees it in the appointment's timeline.
        const timeline = await staff().appointments.timeline('a_007');
        expect(timeline.some((i) => i.type === 'reply')).toBe(true);
    });

    it('cancels and frees the time', async () => {
        await expect(links.cancel('sample-booked')).resolves.toEqual({
            status: 'cancelled',
        });
        expect((await links.views.manage('sample-booked')).state).toBe('valid');
        await expect(links.cancel('sample-booked')).rejects.toMatchObject({
            code: 'INVALID_TRANSITION',
        });
        await expect(links.confirm('sample-booked')).rejects.toMatchObject({
            code: 'INVALID_TRANSITION',
        });
    });

    it('refuses every action on a dead link', async () => {
        for (const token of ['sample-expired', 'sample-unknown']) {
            await expect(links.confirm(token)).rejects.toMatchObject({
                code: 'LINK_EXPIRED',
            });
            await expect(links.cancel(token)).rejects.toMatchObject({
                code: 'LINK_EXPIRED',
            });
        }
    });
});

describe('choosing a new time', () => {
    it('offers the next fourteen days with the doctor’s free times, closed days marked', async () => {
        const view = await links.views.reschedule('sample-booked');

        if (view.state !== 'valid') {
            throw new Error('expected a valid link');
        }

        expect(view.needsApproval).toBe(false);
        expect(view.days).toHaveLength(14);
        expect(view.days[0].date).toBe('2026-10-26');
        // Sunday 1 November: the clinic is closed.
        expect(view.days.find((d) => d.date === '2026-11-01')).toMatchObject({
            closed: true,
            slots: [],
        });
        const tuesday = view.days.find((d) => d.date === '2026-10-27')!;
        expect(tuesday.closed).toBe(false);
        expect(tuesday.slots.length).toBeGreaterThan(0);
        // Only the future, and never a time that is already booked.
        const today = view.days[0].slots;
        expect(today.every((s) => new Date(s).getTime() > NOW.getTime())).toBe(
            true,
        );
        expect(tuesday.slots).not.toContain('2026-10-27T06:00:00.000Z');
    });

    it('offers nothing when the visit cannot be changed', async () => {
        for (const token of [
            'sample-late',
            'sample-pending',
            'sample-cancelled',
        ]) {
            const view = await links.views.reschedule(token);

            expect(view.state === 'valid' && view.days).toEqual([]);
        }
    });

    it('moves the appointment at once and tells reception', async () => {
        const view = await links.views.reschedule('sample-booked');
        const slot =
            view.state === 'valid'
                ? view.days.find((d) => d.slots.length > 0)!.slots[0]
                : '';

        await expect(links.reschedule('sample-booked', slot)).resolves.toEqual({
            result: 'moved',
            startsAt: slot,
        });

        expect(db.appointments.find((a) => a.id === 'a_007')?.startsAt).toBe(
            slot,
        );
        expect(db.replies.at(-1)?.action).toBe('reschedule');
        expect(
            db.notifications.some(
                (n) => n.appointmentId === 'a_007' && n.kind === 'reschedule',
            ),
        ).toBe(true);
    });

    it('files a request instead when the clinic approves time changes, and keeps the original', async () => {
        const view = await links.views.reschedule('sample-approval');

        if (view.state !== 'valid') {
            throw new Error('expected a valid link');
        }

        expect(view.needsApproval).toBe(true);
        const original = db.appointments.find(
            (a) => a.id === 'a_026',
        )!.startsAt;
        const slot = view.days.find((d) => d.slots.length > 0)!.slots[0];

        await expect(
            links.reschedule('sample-approval', slot),
        ).resolves.toEqual({ result: 'requested', startsAt: slot });

        expect(db.appointments.find((a) => a.id === 'a_026')?.startsAt).toBe(
            original,
        );
        expect(
            db.requests.find((r) => r.appointmentId === 'a_026'),
        ).toMatchObject({
            status: 'pending',
            fromStartsAt: original,
            proposedStartsAt: slot,
            doctorId: 'd_noor',
        });
        // One request at a time.
        expect(await links.views.manage('sample-approval')).toMatchObject({
            pendingRequest: true,
            allowed: { reschedule: false },
        });
        await expect(
            links.reschedule('sample-approval', slot),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('says when the time was just taken, with the nearest alternatives', async () => {
        const view = await links.views.reschedule('sample-booked');
        const slot =
            view.state === 'valid'
                ? view.days.find((d) => d.slots.length > 0)!.slots[0]
                : '';
        // Someone else takes it first.
        await links.reschedule('sample-confirmed', slot).catch(() => undefined);
        await staff().appointments.create({
            patientId: 'p_1',
            doctorId: 'd_imran',
            serviceId: 's_followup',
            startsAt: slot,
            source: 'manual',
        });

        await expect(
            links.reschedule('sample-booked', slot),
        ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
        const alternatives = await links
            .reschedule('sample-booked', slot)
            .catch((e: { alternatives: unknown[] }) => e.alternatives);
        expect(alternatives).toHaveLength(3);
    });

    it('refuses a time that is outside the next fourteen days or not a real slot', async () => {
        await expect(
            links.reschedule('sample-booked', '2026-12-01T05:00:00.000Z'),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'startsAt' });
        await expect(
            links.reschedule('sample-booked', '2026-10-27T05:07:00.000Z'),
        ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    });
});

describe('the queue', () => {
    const status = async (token: string) => {
        const view = await links.views.status(token);

        if (view.state !== 'valid') {
            throw new Error('expected a valid link');
        }

        return view;
    };

    it('counts the patient in the consulting room ahead of someone checked in', async () => {
        // a_003 is checked in at 10:00; a_002 is in consultation (a 20-minute visit).
        expect(await status('sample-waiting')).toMatchObject({
            stage: 'waiting',
            ahead: 1,
            waitMin: 20,
        });
    });

    it('is next when nobody is ahead', async () => {
        expect(await status('sample-next')).toMatchObject({
            stage: 'next',
            ahead: 0,
            waitMin: 0,
        });
        db.appointments.find((a) => a.id === 'a_002')!.status = 'done';
        expect(await status('sample-waiting')).toMatchObject({
            stage: 'next',
            ahead: 0,
        });
    });

    it('has a stage for every situation', async () => {
        expect((await status('sample-notarrived')).stage).toBe('notYet');
        expect((await status('sample-consult')).stage).toBe('consult');
        expect((await status('sample-done')).stage).toBe('done');
        expect((await status('sample-booked')).stage).toBe('notToday');
        expect((await status('sample-cancelled')).stage).toBe('notToday');
        db.appointments.find((a) => a.id === 'a_004')!.status = 'cancelled';
        expect((await status('sample-notarrived')).stage).toBe('ended');
    });

    it('stamps when it was worked out', async () => {
        expect((await status('sample-waiting')).updatedAt).toBe(
            NOW.toISOString(),
        );
    });
});

describe('asking for a new link', () => {
    it('always answers the same, for a known, expired or unknown link', async () => {
        for (const token of ['sample-booked', 'sample-expired', 'nonsense']) {
            await expect(links.requestNewLink(token)).resolves.toBeUndefined();
        }
    });

    it('limits how often one link can ask', async () => {
        await links.requestNewLink('sample-expired');
        await links.requestNewLink('sample-expired');
        await links.requestNewLink('sample-expired');

        await expect(
            links.requestNewLink('sample-expired'),
        ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

        vi.setSystemTime(new Date(NOW.getTime() + 61_000));
        await expect(
            links.requestNewLink('sample-expired'),
        ).resolves.toBeUndefined();
    });
});

describe('another clinic', () => {
    it('is reached only through its own link, and shows its own details', async () => {
        const view = await links.views.manage('sample-approval');

        expect(view).toMatchObject({
            state: 'valid',
            clinic: { name: 'Noor Medical Centre' },
            appointment: {
                firstName: 'Nadia',
                doctorName: 'Dr. Tariq Mehmood',
            },
        });
    });
});
