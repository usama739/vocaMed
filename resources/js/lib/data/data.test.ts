// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
    createMockDataSource,
    createMockPatientLinks,
    SLOT_HOLD_SECONDS,
} from './mock';
import {
    createSeedDatabase,
    DEMO_CLINIC_ID,
    OTHER_CLINIC_ID,
    type MockDatabase,
} from './seed';
import type { DataSource } from './source';
import { addDays, utcToZoned, zonedToUtc } from './time';
import { DataError } from './types';

// Monday 08:00 in Karachi, so every working-hour slot today is still in the future.
const START = new Date('2026-10-26T03:00:00.000Z');
const TODAY = '2026-10-26';

let clock = START;
let db: MockDatabase;
let reception: DataSource;

beforeEach(() => {
    clock = START;
    db = createSeedDatabase(START);
    reception = createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId: 'u_recep',
        now: () => clock,
    });
});

const firstFreeSlot = async (source = reception) => {
    const slots = await source.slots.list({
        doctorId: 'd_sana',
        serviceId: 's_general',
        date: TODAY,
    });
    const slot = slots.find((s) => s.state === 'free');

    if (!slot) {
        throw new Error('expected a free slot');
    }

    return slot;
};

describe('time helpers', () => {
    it('converts clinic wall time to UTC and back', () => {
        const at = zonedToUtc(TODAY, '09:30', 'Asia/Karachi');

        expect(at.toISOString()).toBe('2026-10-26T04:30:00.000Z');
        expect(utcToZoned(at, 'Asia/Karachi')).toEqual({
            date: TODAY,
            time: '09:30',
            weekday: 1,
        });
    });

    it('handles daylight saving offsets', () => {
        expect(
            zonedToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(),
        ).toBe('2026-07-01T13:00:00.000Z');
        expect(
            zonedToUtc('2026-01-01', '09:00', 'America/New_York').toISOString(),
        ).toBe('2026-01-01T14:00:00.000Z');
    });

    it('adds calendar days across month ends', () => {
        expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    });
});

describe('tenant isolation', () => {
    it('only returns the bound clinic’s rows', async () => {
        const other = createMockDataSource(db, {
            clinicId: OTHER_CLINIC_ID,
            actorId: 'u_noor_admin',
            now: () => clock,
        });

        expect(
            (await reception.doctors.list()).every(
                (d) => d.clinicId === DEMO_CLINIC_ID,
            ),
        ).toBe(true);
        expect((await other.doctors.list()).map((d) => d.id)).toEqual([
            'd_noor',
        ]);
    });

    it('cannot read another clinic’s records by id', async () => {
        await expect(reception.patients.get('p_9')).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        await expect(reception.appointments.get('a_011')).rejects.toMatchObject(
            { code: 'NOT_FOUND' },
        );
    });

    it('allows the same phone number in two clinics', async () => {
        const other = createMockDataSource(db, {
            clinicId: OTHER_CLINIC_ID,
            actorId: 'u_noor_admin',
            now: () => clock,
        });

        expect((await other.patients.search('0300 1234567'))[0].id).toBe('p_9');
        expect((await reception.patients.search('0300 1234567'))[0].id).toBe(
            'p_1',
        );
    });
});

describe('patients', () => {
    it('searches phone matches before name matches', async () => {
        const results = await reception.patients.search('ali');

        expect(results.map((p) => p.name)).toContain('Ali Raza');
        expect((await reception.patients.search('3331234569'))[0].name).toBe(
            'Ali Raza',
        );
    });

    it('normalises a local phone number to the clinic country code', async () => {
        const created = await reception.patients.create({
            name: ' Test Patient ',
            phone: '0312 555 0101',
        });

        expect(created.phone).toBe('+923125550101');
        expect(created.name).toBe('Test Patient');
    });

    it('rejects duplicate and invalid phone numbers', async () => {
        await expect(
            reception.patients.create({ name: 'Dup', phone: '+923001234567' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(
            reception.patients.create({ name: 'Bad', phone: '12' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
});

describe('slots and booking', () => {
    it('never offers slots that overlap existing appointments, breaks or the past', async () => {
        const slots = await reception.slots.list({
            doctorId: 'd_sana',
            serviceId: 's_general',
            date: TODAY,
        });
        const times = slots.map(
            (s) => utcToZoned(new Date(s.startsAt), 'Asia/Karachi').time,
        );

        expect(times).not.toContain('09:00');
        expect(times).not.toContain('13:00');
        expect(times.length).toBeGreaterThan(0);
    });

    it('books a free slot, removes it from the list and queues a confirmation', async () => {
        const slot = await firstFreeSlot();
        const appointment = await reception.appointments.create({
            patientId: 'p_4',
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slot.startsAt,
            source: 'voice',
        });

        expect(appointment.status).toBe('booked');
        expect(
            (
                await reception.slots.list({
                    doctorId: 'd_sana',
                    serviceId: 's_general',
                    date: TODAY,
                })
            ).map((s) => s.startsAt),
        ).not.toContain(slot.startsAt);
        expect(
            (await reception.notifications.list({ status: 'queued' })).some(
                (n) => n.appointmentId === appointment.id,
            ),
        ).toBe(true);
        expect(
            (await reception.audit.list({ action: 'appointment.created' }))[0]
                .subjectId,
        ).toBe(appointment.id);
    });

    it('rejects a taken slot with three nearest alternatives', async () => {
        const slot = await firstFreeSlot();
        const input = {
            patientId: 'p_4',
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slot.startsAt,
            source: 'manual' as const,
        };
        await reception.appointments.create(input);

        const error = await reception.appointments
            .create({ ...input, patientId: 'p_5' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DataError);
        expect((error as DataError).code).toBe('SLOT_UNAVAILABLE');
        expect((error as DataError).alternatives).toHaveLength(3);
        expect(
            (error as DataError).alternatives.every(
                (s) => s.startsAt !== slot.startsAt,
            ),
        ).toBe(true);
    });

    it('refuses a doctor and service pair that is not offered', async () => {
        await expect(
            reception.slots.list({
                doctorId: 'd_hina',
                serviceId: 's_child',
                date: TODAY,
            }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('returns no slots during time off or on a holiday', async () => {
        const off = addDays(TODAY, 7); // Monday inside Dr. Hina’s time off
        const holiday = addDays(TODAY, 19);

        expect(
            await reception.slots.list({
                doctorId: 'd_hina',
                serviceId: 's_general',
                date: off,
            }),
        ).toEqual([]);
        expect(
            await reception.slots.list({
                doctorId: 'd_sana',
                serviceId: 's_general',
                date: holiday,
            }),
        ).toEqual([]);
    });
});

describe('slot holds', () => {
    it('shows a held slot as held to others but selectable to the holder, until it expires', async () => {
        const slot = await firstFreeSlot();
        const hold = await reception.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slot.startsAt,
        });
        const colleague = createMockDataSource(db, {
            clinicId: DEMO_CLINIC_ID,
            actorId: 'u_admin',
            now: () => clock,
        });
        const query = {
            doctorId: 'd_sana',
            serviceId: 's_general',
            date: TODAY,
        };

        expect(
            (await colleague.slots.list(query)).find(
                (s) => s.startsAt === slot.startsAt,
            ),
        ).toMatchObject({ state: 'held', heldByMe: false });
        expect(
            (await reception.slots.list(query)).find(
                (s) => s.startsAt === slot.startsAt,
            ),
        ).toMatchObject({ state: 'held', heldByMe: true });
        await expect(
            colleague.slots.hold({
                doctorId: 'd_sana',
                serviceId: 's_general',
                startsAt: slot.startsAt,
            }),
        ).rejects.toMatchObject({
            code: 'SLOT_UNAVAILABLE',
        });

        clock = new Date(new Date(hold.expiresAt).getTime() + 1000);
        expect(new Date(hold.expiresAt).getTime() - START.getTime()).toBe(
            SLOT_HOLD_SECONDS * 1000,
        );
        expect(
            (await colleague.slots.list(query)).find(
                (s) => s.startsAt === slot.startsAt,
            )?.state,
        ).toBe('free');
    });

    it('lets a user hold only one slot at a time', async () => {
        const slots = (
            await reception.slots.list({
                doctorId: 'd_sana',
                serviceId: 's_general',
                date: TODAY,
            })
        ).filter((s) => s.state === 'free');
        await reception.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slots[0].startsAt,
        });
        await reception.slots.hold({
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: slots[1].startsAt,
        });

        const after = await reception.slots.list({
            doctorId: 'd_sana',
            serviceId: 's_general',
            date: TODAY,
        });

        expect(after.filter((s) => s.state === 'held')).toHaveLength(1);
        expect(after.find((s) => s.startsAt === slots[0].startsAt)?.state).toBe(
            'free',
        );
    });
});

describe('appointment lifecycle', () => {
    it('follows the allowed status transitions and counts no-shows', async () => {
        const arrived = await reception.appointments.setStatus(
            'a_005',
            'arrived',
        );
        expect(arrived.status).toBe('arrived');
        expect(
            (await reception.appointments.setStatus('a_005', 'in_consultation'))
                .status,
        ).toBe('in_consultation');
        await expect(
            reception.appointments.setStatus('a_005', 'booked'),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

        const before = (await reception.patients.get('p_4')).noShowCount;
        await reception.appointments.setStatus('a_004', 'no_show');
        expect((await reception.patients.get('p_4')).noShowCount).toBe(
            before + 1,
        );
    });

    it('reschedules into a free slot, frees the old one and resets to booked', async () => {
        const slot = await firstFreeSlot();
        const moved = await reception.appointments.reschedule(
            'a_004',
            slot.startsAt,
        );

        expect(moved.startsAt).toBe(slot.startsAt);
        expect(moved.status).toBe('booked');
        await expect(
            reception.appointments.reschedule('a_001', slot.startsAt),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('cancels, queues a cancellation message and frees the slot', async () => {
        const cancelled = await reception.appointments.cancel('a_004');

        expect(cancelled.status).toBe('cancelled');
        expect(
            (await reception.notifications.list()).some(
                (n) => n.kind === 'cancellation' && n.appointmentId === 'a_004',
            ),
        ).toBe(true);
        await expect(
            reception.appointments.cancel('a_004'),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('filters, sorts and paginates the appointment list', async () => {
        const page = await reception.appointments.list({
            from: TODAY,
            to: TODAY,
            perPage: 3,
            sort: '-startsAt',
        });

        expect(page.total).toBe(7);
        expect(page.items).toHaveLength(3);
        expect(page.items[0].startsAt >= page.items[1].startsAt).toBe(true);
        expect(
            (await reception.appointments.list({ status: 'no_show' })).items,
        ).toHaveLength(1);
        expect(
            (
                await reception.appointments.list({ patient: 'usman' })
            ).items.every((a) => a.patientId === 'p_1'),
        ).toBe(true);
    });
});

describe('signed patient links', () => {
    it('resolves a valid token and treats unknown or expired tokens the same', async () => {
        const links = createMockPatientLinks(db);
        const valid = await links.resolve('tok_a_001');

        expect(valid.state).toBe('valid');
        expect(valid.state === 'valid' && valid.clinic.id).toBe(DEMO_CLINIC_ID);
        expect(await links.resolve('tok_expired')).toEqual({
            state: 'expired',
        });
        expect(await links.resolve('nonsense')).toEqual({ state: 'expired' });
    });
});

describe('API boundary', () => {
    it('returns copies, so callers cannot mutate stored data', async () => {
        const patient = await reception.patients.get('p_1');
        patient.name = 'Changed';

        expect((await reception.patients.get('p_1')).name).toBe(
            'Muhammad Usman',
        );
    });
});

describe('reception console additions', () => {
    it('adds a walk-in even to a busy time, already arrived and without a confirmation', async () => {
        const busy = (await reception.appointments.get('a_004')).startsAt;
        const before = (await reception.notifications.list()).length;
        const created = await reception.appointments.create({
            patientId: 'p_7',
            doctorId: 'd_sana',
            serviceId: 's_general',
            startsAt: busy,
            source: 'walk_in',
        });

        expect(created.status).toBe('arrived');
        expect(created.createdBy).toBe('u_recep');
        expect((await reception.notifications.list()).length).toBe(before);
    });

    it('still refuses a normal booking into a busy time', async () => {
        const busy = (await reception.appointments.get('a_004')).startsAt;

        await expect(
            reception.appointments.create({
                patientId: 'p_7',
                doctorId: 'd_sana',
                serviceId: 's_general',
                startsAt: busy,
                source: 'manual',
            }),
        ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    });

    it('creates a patient without a phone only when asked to', async () => {
        const patient = await reception.patients.create({
            name: 'Walk-in guest',
            phone: '',
            noPhone: true,
        });

        expect(patient.phone).toBe('');
        await expect(
            reception.patients.create({ name: 'No number', phone: '' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('updates a patient, normalises the phone and refuses a duplicate', async () => {
        const updated = await reception.patients.update('p_1', {
            phone: '0300 1234999',
            consent: false,
            notes: 'Prefers mornings',
        });

        expect(updated.phone).toBe('+923001234999');
        expect(updated.consent).toBe(false);
        await expect(
            reception.patients.update('p_1', { phone: '+923121234568' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(
            reception.patients.update('p_1', { name: '  ' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(
            (await reception.audit.list({ subjectId: 'p_1' })).some(
                (e) => e.action === 'patient.updated',
            ),
        ).toBe(true);
    });

    it('lets a same-day status step back one stage', async () => {
        await expect(
            reception.appointments.undoStatus('a_003'),
        ).resolves.toMatchObject({ status: 'confirmed' });
        await expect(
            reception.appointments.undoStatus('a_002'),
        ).resolves.toMatchObject({ status: 'arrived' });
        await expect(
            reception.appointments.undoStatus('a_005'),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('takes a no-show back off the patient’s count when undone', async () => {
        const before = (await reception.patients.get('p_6')).noShowCount;
        await reception.appointments.undoStatus('a_006');

        expect((await reception.patients.get('p_6')).noShowCount).toBe(
            Math.max(0, before - 1),
        );
    });

    it('will not undo a status on another day', async () => {
        clock = new Date(START.getTime() + 2 * 86_400_000);

        await expect(
            reception.appointments.undoStatus('a_003'),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('records the previous status so history can show it', async () => {
        await reception.appointments.setStatus('a_005', 'arrived');
        const entry = (await reception.audit.list({ subjectId: 'a_005' })).find(
            (e) => e.action === 'appointment.status_changed',
        );

        expect(entry?.meta).toMatchObject({
            status: 'arrived',
            from: 'booked',
        });
    });

    it('lists an appointment’s messages and patient replies, newest first', async () => {
        const timeline = await reception.appointments.timeline('a_004');

        expect(timeline.some((i) => i.type === 'reply')).toBe(true);
        expect(timeline.some((i) => i.type === 'message')).toBe(true);
        expect(
            timeline.every(
                (item, index) =>
                    index === 0 || timeline[index - 1].at >= item.at,
            ),
        ).toBe(true);
    });

    it('marks a failed message as resent and queues a new one, leaving the log append-only', async () => {
        const failed = (await reception.notifications.list()).find(
            (n) => n.status === 'failed' && !n.resentAt,
        );

        if (!failed) {
            throw new Error('expected a failed message in the seed');
        }

        const next = await reception.notifications.resend(failed.id);
        const log = await reception.notifications.list();

        expect(next.status).toBe('queued');
        expect(log.find((n) => n.id === failed.id)?.resentAt).toBeTruthy();
        expect(log.find((n) => n.id === failed.id)?.status).toBe('failed');
        expect(log[0].createdAt >= log.at(-1)!.createdAt).toBe(true);
    });

    it('lists the holds on a date', async () => {
        const slot = await firstFreeSlot();
        const hold = await reception.slots.hold({
            doctorId: slot.doctorId,
            serviceId: slot.serviceId,
            startsAt: slot.startsAt,
        });

        expect((await reception.slots.holds(TODAY)).map((h) => h.id)).toContain(
            hold.id,
        );
        expect(await reception.slots.holds(addDays(TODAY, 3))).toEqual([]);
    });

    it('filters appointments by patient', async () => {
        const page = await reception.appointments.list({ patientId: 'p_1' });

        expect(page.items.length).toBeGreaterThan(0);
        expect(page.items.every((a) => a.patientId === 'p_1')).toBe(true);
    });
});
