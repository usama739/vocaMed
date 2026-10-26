// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDataSource } from './mock';
import { createSeedDatabase, DEMO_CLINIC_ID, type MockDatabase } from './seed';
import type { DataSource } from './source';
import type { AvailabilityDraft, DoctorSaveInput } from './types';

// Monday 10:15 in Karachi.
const NOW = new Date('2026-10-26T05:15:00.000Z');

let db: MockDatabase;
const as = (actorId: string): DataSource =>
    createMockDataSource(db, {
        clinicId: DEMO_CLINIC_ID,
        actorId,
        now: () => new Date(),
    });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = createSeedDatabase(NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('only the clinic admin may use the admin pages', () => {
    it('refuses every other role, for reads and for writes', async () => {
        for (const actor of ['u_recep', 'u_doc1']) {
            const source = as(actor);

            await expect(source.views.adminStaff()).rejects.toMatchObject({
                code: 'FORBIDDEN',
            });
            await expect(
                source.views.adminOverview({ period: 'month' }),
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(
                source.staff.invite({
                    email: 'a@b.co',
                    role: 'receptionist',
                }),
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(
                source.services.setActive('s_general', false),
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        }
    });
});

describe('staff', () => {
    it('lists people and invitations, with the rules as flags', async () => {
        const { rows } = await as('u_admin').views.adminStaff();
        const byEmail = Object.fromEntries(rows.map((r) => [r.email, r]));

        expect(byEmail['ayesha@shifa.example']).toMatchObject({
            status: 'active',
            isYou: true,
            allowed: { deactivate: false },
        });
        expect(byEmail['bilal@shifa.example'].allowed.deactivate).toBe(true);
        expect(byEmail['kamran@shifa.example']).toMatchObject({
            status: 'deactivated',
            allowed: { reactivate: true },
        });
        expect(byEmail['newdesk@shifa.example']).toMatchObject({
            status: 'invited',
            allowed: { resend: true, revoke: true },
        });
        expect(byEmail['weekend.desk@shifa.example'].status).toBe('expired');
        // Doctors are managed on their own page.
        expect(rows.some((r) => r.email === 'sana@shifa.example')).toBe(false);
        // Active people first, deactivated last.
        expect(rows.at(-1)?.status).toBe('deactivated');
    });

    it('invites, and refuses a bad or taken address', async () => {
        const admin = as('u_admin');

        await expect(
            admin.staff.invite({ email: 'nope', role: 'receptionist' }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'email' });
        await expect(
            admin.staff.invite({
                email: 'Bilal@shifa.example',
                role: 'receptionist',
            }),
        ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL', field: 'email' });
        await expect(
            admin.staff.invite({
                email: 'newdesk@shifa.example',
                role: 'clinic_admin',
            }),
        ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });

        const invitation = await admin.staff.invite({
            email: 'New.Person@shifa.example',
            role: 'clinic_admin',
        });

        expect(invitation).toMatchObject({
            email: 'new.person@shifa.example',
            role: 'clinic_admin',
            status: 'pending',
        });
        // Seven days to accept.
        expect(
            new Date(invitation.expiresAt).getTime() -
                new Date(invitation.sentAt).getTime(),
        ).toBe(7 * 86_400_000);
    });

    it('sends again, revokes, deactivates and reactivates', async () => {
        const admin = as('u_admin');

        await vi.advanceTimersByTimeAsync(3_600_000);
        const resent = await admin.staff.resend('inv_1');
        expect(new Date(resent.sentAt).getTime()).toBeGreaterThan(
            NOW.getTime(),
        );

        await admin.staff.revoke('inv_1');
        const after = await admin.views.adminStaff();
        expect(after.rows.some((r) => r.id === 'inv_1')).toBe(false);
        await expect(admin.staff.revoke('inv_1')).rejects.toMatchObject({
            code: 'INVALID_TRANSITION',
        });

        await expect(
            admin.staff.setActive('u_recep', false),
        ).resolves.toMatchObject({ active: false });
        await expect(
            admin.staff.setActive('u_recep', true),
        ).resolves.toMatchObject({ active: true });
    });

    it('will not deactivate yourself or the last admin', async () => {
        const admin = as('u_admin');

        await expect(
            admin.staff.setActive('u_admin', false),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });

        // A second admin makes the first deactivatable, until only one is left.
        const second = await admin.staff.invite({
            email: 'second@shifa.example',
            role: 'clinic_admin',
        });
        db.users.push({
            id: 'u_admin2',
            clinicId: DEMO_CLINIC_ID,
            name: 'Second Admin',
            email: second.email,
            role: 'clinic_admin',
            active: true,
            locale: 'en',
        });

        await expect(
            as('u_admin2').staff.setActive('u_admin', false),
        ).resolves.toMatchObject({ active: false });
        // u_admin2 is now the only active admin, so the page offers no way to remove them.
        const flags = (await as('u_admin2').views.adminStaff()).rows.find(
            (r) => r.id === 'u_admin2',
        );
        expect(flags?.allowed.deactivate).toBe(false);
    });
});

describe('services', () => {
    it('creates, edits and switches a service, keeping who offers it', async () => {
        const admin = as('u_admin');
        const created = await admin.services.create({
            name: '  Vaccination ',
            durationMin: 15,
            bufferMin: 5,
            doctorIds: ['d_imran'],
        });

        expect(created).toMatchObject({ name: 'Vaccination', active: true });
        expect(
            db.doctors.find((d) => d.id === 'd_imran')?.serviceIds,
        ).toContain(created.id);

        await admin.services.update(created.id, {
            name: 'Vaccination',
            durationMin: 20,
            bufferMin: 0,
            doctorIds: ['d_sana'],
        });
        const view = await admin.views.adminServices();
        expect(
            view.services.find((s) => s.service.id === created.id),
        ).toMatchObject({
            service: { durationMin: 20 },
            doctorIds: ['d_sana'],
        });

        await expect(
            admin.services.setActive(created.id, false),
        ).resolves.toMatchObject({ active: false });
    });

    it('validates the name and the numbers', async () => {
        const admin = as('u_admin');
        const base = {
            name: 'X',
            durationMin: 30,
            bufferMin: 5,
            doctorIds: [],
        };

        await expect(
            admin.services.create({ ...base, name: '  ' }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'name' });
        await expect(
            admin.services.create({ ...base, name: 'follow-up VISIT' }),
        ).rejects.toMatchObject({ code: 'DUPLICATE_NAME' });
        await expect(
            admin.services.create({ ...base, durationMin: 3 }),
        ).rejects.toMatchObject({ field: 'durationMin' });
        await expect(
            admin.services.create({ ...base, bufferMin: 90 }),
        ).rejects.toMatchObject({ field: 'bufferMin' });
    });
});

describe('doctors', () => {
    const availability = async (): Promise<AvailabilityDraft> =>
        (await as('u_admin').views.adminDoctor({ doctorId: 'new' }))!.draft;

    it('shows a blank doctor with weekday hours and a preview', async () => {
        const view = await as('u_admin').views.adminDoctor({
            doctorId: 'new',
        });

        expect(view?.id).toBeNull();
        expect(view?.profile).toMatchObject({ name: '', active: true });
        expect(view?.draft.days.filter((d) => d.on)).toHaveLength(5);
        expect(view?.preview.total).toBeGreaterThan(0);
        expect(view?.preview.affected).toEqual([]);
    });

    it('creates a doctor, who then has no sign-in and can be edited', async () => {
        const admin = as('u_admin');
        const input: DoctorSaveInput = {
            profile: {
                name: ' Dr. Zara Ahmed ',
                specialty: 'ENT',
                languages: ['en', 'pa'],
                serviceIds: ['s_general', 'bogus'],
                active: true,
            },
            availability: await availability(),
        };
        const doctor = await admin.doctors.create(input);

        expect(doctor).toMatchObject({
            name: 'Dr. Zara Ahmed',
            languages: ['en', 'pa'],
            serviceIds: ['s_general'],
        });

        const view = await admin.views.adminDoctor({ doctorId: doctor.id });
        expect(view?.signIn.state).toBe('none');
        expect(view?.draft.days[0]).toMatchObject({ weekday: 1, on: true });

        const saved = await admin.doctors.save(doctor.id, {
            ...input,
            profile: { ...input.profile, specialty: 'Cardiology' },
        });
        expect(saved.specialty).toBe('Cardiology');
    });

    it('needs a name, and says so by field', async () => {
        await expect(
            as('u_admin').doctors.create({
                profile: {
                    name: ' ',
                    specialty: '',
                    languages: [],
                    serviceIds: [],
                    active: true,
                },
                availability: await availability(),
            }),
        ).rejects.toMatchObject({ code: 'VALIDATION', field: 'name' });
    });

    it('a doctor with no hours triggers the overview alert, and deactivating keeps appointments', async () => {
        const admin = as('u_admin');
        const doctor = await admin.doctors.create({
            profile: {
                name: 'Dr. No Hours',
                specialty: '',
                languages: [],
                serviceIds: [],
                active: true,
            },
            availability: {
                days: (await availability()).days.map((d) => ({
                    ...d,
                    on: false,
                })),
                timeOff: [],
                blocked: [],
            },
        });
        const overview = await admin.views.adminOverview({ period: 'month' });

        expect(overview.alerts.doctorsWithoutHours).toEqual([
            { id: doctor.id, name: 'Dr. No Hours' },
        ]);

        const before = db.appointments.length;
        await admin.doctors.setActive('d_sana', false);
        expect(db.appointments).toHaveLength(before);

        const list = await admin.views.adminDoctors({ status: 'inactive' });
        expect(list.rows.map((r) => r.doctor.id)).toEqual(['d_sana']);
        expect(list.rows[0].nextFree).toBeNull();
        expect(list.total).toBe(4);
    });

    it('searches by name or specialty and counts upcoming appointments', async () => {
        const admin = as('u_admin');
        const found = await admin.views.adminDoctors({
            q: 'paediat',
            status: 'all',
        });

        expect(found.rows.map((r) => r.doctor.id)).toEqual(['d_imran']);
        const all = await admin.views.adminDoctors({ status: 'all' });
        expect(
            all.rows.find((r) => r.doctor.id === 'd_sana')?.upcoming,
        ).toBeGreaterThan(0);
    });

    it('invites a doctor to sign in and shows the state', async () => {
        const admin = as('u_admin');
        await admin.doctors.invite('d_hina', 'hina.doc@shifa.example');

        expect(
            (await admin.views.adminDoctor({ doctorId: 'd_hina' }))?.signIn,
        ).toMatchObject({ state: 'invited', email: 'hina.doc@shifa.example' });
        expect(
            (await admin.views.adminDoctor({ doctorId: 'd_sana' }))?.signIn,
        ).toMatchObject({ state: 'active', email: 'sana@shifa.example' });
        // A doctor's invitation is not in the staff list.
        expect(
            (await admin.views.adminStaff()).rows.some(
                (r) => r.email === 'hina.doc@shifa.example',
            ),
        ).toBe(false);
        await expect(
            admin.doctors.invite('d_hina', 'bilal@shifa.example'),
        ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
    });

    it('answers null for a doctor that does not exist', async () => {
        await expect(
            as('u_admin').views.adminDoctor({ doctorId: 'nobody' }),
        ).resolves.toBeNull();
    });

    it('the admin can preview and save any doctor’s availability, the doctor only their own', async () => {
        const admin = as('u_admin');
        const draft = (await admin.views.adminDoctor({ doctorId: 'd_sana' }))!
            .draft;
        const off: AvailabilityDraft = {
            ...draft,
            days: draft.days.map((d) =>
                d.weekday === 2 ? { ...d, on: false } : d,
            ),
        };

        const preview = await admin.doctors.previewAvailability(off, 'd_sana');
        expect(preview.slotsPerWeekday[1]).toBe(0);
        await admin.doctors.saveAvailability(off, 'd_sana');
        expect(
            (await admin.views.availability({ doctorId: 'd_sana' })).draft
                .days[1].on,
        ).toBe(false);
        // A doctor's own call ignores a doctor id that is not theirs.
        const doctor = as('u_doc2');
        await doctor.doctors.saveAvailability(draft);
        expect(
            db.availability.find((a) => a.doctorId === 'd_imran')?.windows
                .length,
        ).toBeGreaterThan(0);
    });
});

describe('clinic settings', () => {
    const draftOf = async () => {
        const view = await as('u_admin').views.adminSettings();
        const { clinicId: _clinicId, ...settings } = view.settings;
        void _clinicId;

        return {
            clinic: {
                name: view.clinic.name,
                phone: view.clinic.phone,
                address: view.clinic.address,
                timezone: view.clinic.timezone,
                defaultLocale: view.clinic.defaultLocale,
            },
            settings,
        };
    };

    it('saves details, hours, holidays, reminders, voice and the approval switch', async () => {
        const admin = as('u_admin');
        const draft = await draftOf();
        draft.clinic.name = 'Shifa Clinic';
        draft.clinic.phone = '0300 1234567';
        draft.settings.reminderHoursBefore = [48, 24, 2];
        draft.settings.cancellationWindowHours = null;
        draft.settings.rescheduleRequiresApproval = true;
        draft.settings.voiceAudioRetentionDays = 0;
        draft.settings.holidays.push({ date: '2026-12-25', name: 'Quaid Day' });

        await admin.settings.save(draft);
        const after = await admin.views.adminSettings();

        expect(after.clinic).toMatchObject({
            name: 'Shifa Clinic',
            phone: '+923001234567',
        });
        expect(after.settings).toMatchObject({
            reminderHoursBefore: [48, 24, 2],
            cancellationWindowHours: null,
            rescheduleRequiresApproval: true,
            voiceAudioRetentionDays: 0,
        });
        expect(db.audit[0]).toMatchObject({
            action: 'settings.updated',
            meta: { section: expect.stringContaining('reminders') },
        });
    });

    it('refuses what the server cannot accept', async () => {
        const admin = as('u_admin');
        const bad = async (
            change: (d: Awaited<ReturnType<typeof draftOf>>) => void,
        ) => {
            const draft = await draftOf();
            change(draft);

            return admin.settings.save(draft);
        };

        await expect(bad((d) => (d.clinic.name = ' '))).rejects.toMatchObject({
            field: 'name',
        });
        await expect(bad((d) => (d.clinic.phone = '12'))).rejects.toMatchObject(
            { code: 'INVALID_PHONE' },
        );
        await expect(
            bad((d) => (d.clinic.timezone = 'Mars/Base')),
        ).rejects.toMatchObject({ field: 'timezone' });
        await expect(
            bad((d) => (d.settings.reminderHoursBefore = [24, 24])),
        ).rejects.toMatchObject({ field: 'reminderHoursBefore' });
        await expect(
            bad((d) => (d.settings.businessHours[0].open = '18:00')),
        ).rejects.toMatchObject({ field: 'businessHours' });
        await expect(
            bad((d) => d.settings.holidays.push({ date: '', name: 'x' })),
        ).rejects.toMatchObject({ field: 'holidays' });
    });
});

describe('message templates', () => {
    const key = { kind: 'reminder', channel: 'sms', locale: 'en' } as const;

    it('lists all sixteen, marking the one this clinic edited', async () => {
        const view = await as('u_admin').views.adminTemplates();

        expect(view.templates).toHaveLength(16);
        expect(view.templates.filter((t) => t.isCustom)).toHaveLength(1);
        expect(view.variables).toContain('clinic_name');
        expect(view.sample.ur.patient_name).toBeTruthy();
    });

    it('saves, resets, and drops the override when the text is the default again', async () => {
        const admin = as('u_admin');
        const find = async () =>
            (await admin.views.adminTemplates()).templates.find(
                (t) =>
                    t.kind === 'confirmation' &&
                    t.channel === 'whatsapp' &&
                    t.locale === 'ur',
            )!;
        const k = {
            kind: 'confirmation',
            channel: 'whatsapp',
            locale: 'ur',
        } as const;

        await admin.templates.save(k, 'السلام علیکم {patient_name}');
        expect(await find()).toMatchObject({
            isCustom: true,
            body: 'السلام علیکم {patient_name}',
        });
        await admin.templates.reset(k);
        expect(await find()).toMatchObject({ isCustom: false });
        await admin.templates.save(k, (await find()).defaultBody);
        expect((await find()).isCustom).toBe(false);
        await admin.templates.reset(key);
        expect(
            (await admin.views.adminTemplates()).templates.filter(
                (t) => t.isCustom,
            ),
        ).toHaveLength(0);
    });

    it('rejects an empty message and an unknown variable, naming it', async () => {
        const admin = as('u_admin');

        await expect(admin.templates.save(key, '  ')).rejects.toMatchObject({
            code: 'VALIDATION',
            field: 'body',
        });
        await expect(
            admin.templates.save(key, 'Hi {patient_name}, {nickname}'),
        ).rejects.toMatchObject({
            code: 'UNKNOWN_VARIABLE',
            detail: 'nickname',
        });
    });

    it('sends a test to a valid phone only', async () => {
        const admin = as('u_admin');

        await expect(
            admin.templates.testSend(key, 'Hi {patient_name}', '0300 1234567'),
        ).resolves.toEqual({ sentTo: '+923001234567' });
        await expect(
            admin.templates.testSend(key, 'Hi', 'abc'),
        ).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    });
});

describe('audit log', () => {
    it('filters by date, user and category, newest first, and pages', async () => {
        const admin = as('u_admin');
        const month = await admin.views.adminAudit({ days: 30, page: 1 });
        const today = await admin.views.adminAudit({ days: 1, page: 1 });

        expect(month.total).toBeGreaterThan(today.total);
        expect(month.rows.map((r) => r.at)).toEqual(
            [...month.rows.map((r) => r.at)].sort().reverse(),
        );
        expect(month.perPage).toBe(25);
        expect(month.rows.length).toBeLessThanOrEqual(25);

        const logins = await admin.views.adminAudit({
            days: 30,
            category: 'login',
            page: 1,
        });
        expect(logins.rows.length).toBeGreaterThan(0);
        expect(logins.rows.every((r) => r.category === 'login')).toBe(true);

        const bilal = await admin.views.adminAudit({
            days: 30,
            userId: 'u_recep',
            page: 1,
        });
        expect(
            bilal.rows.every(
                (r) =>
                    r.actor.kind === 'user' && r.actor.name === 'Bilal Ahmed',
            ),
        ).toBe(true);
        expect(month.users.map((u) => u.name)).toContain('Ayesha Khan');
    });

    it('joins the patient and doctor to booking entries', async () => {
        const { rows } = await as('u_admin').views.adminAudit({
            days: 30,
            category: 'booking',
            page: 1,
        });

        expect(rows[0].appointment).toMatchObject({
            patientName: expect.any(String),
            doctorName: expect.stringContaining('Dr.'),
        });
    });

    it('records what the admin just did', async () => {
        const admin = as('u_admin');
        await admin.staff.invite({
            email: 'x.y@shifa.example',
            role: 'receptionist',
        });
        const { rows } = await admin.views.adminAudit({
            days: 1,
            category: 'invite',
            page: 1,
        });

        expect(rows[0]).toMatchObject({
            action: 'user.invited',
            actor: { name: 'Ayesha Khan' },
            meta: { email: 'x.y@shifa.example' },
        });
    });
});

describe('overview', () => {
    it('gives each period a comparison and the same numbers for the same day', async () => {
        const admin = as('u_admin');

        for (const period of ['last7', 'month', 'last3months'] as const) {
            const view = await admin.views.adminOverview({ period });
            const again = await admin.views.adminOverview({ period });

            expect(again.kpis).toEqual(view.kpis);
            expect(view.kpis.booked.value).toBeGreaterThan(0);
            expect(view.kpis.booked.previous).toBeGreaterThan(0);
            expect(view.trend.points.length).toBe(
                period === 'last7' ? 7 : period === 'month' ? 26 : 13,
            );
            expect(view.trend.points.reduce((s, p) => s + p.current, 0)).toBe(
                view.kpis.booked.value,
            );
            expect(view.weekdays).toHaveLength(7);
            expect(view.weekdays[6]).toBe(0); // closed on Sunday
            const { done, upcoming, cancelled, noShow } = view.outcomes;
            expect(done + upcoming + cancelled + noShow).toBe(
                view.kpis.booked.value,
            );
            expect(view.sources.voice + view.sources.manual).toBe(
                view.kpis.booked.value,
            );
        }
    });

    it('uses the real day for the table of doctors and the failed-message alert', async () => {
        const view = await as('u_admin').views.adminOverview({
            period: 'month',
        });
        const sana = view.todayDoctors.find((d) => d.doctor.id === 'd_sana')!;

        expect(sana.booked).toBeGreaterThan(0);
        expect(
            sana.arrived + sana.inConsultation + sana.done,
        ).toBeLessThanOrEqual(sana.booked);
        expect(view.alerts.failedMessages).toBeGreaterThan(0);
        expect(view.alerts.doctorsWithoutHours).toEqual([]);
        expect(view.period).toMatchObject({
            from: '2026-10-01',
            to: '2026-10-26',
            previousFrom: '2026-09-01',
            previousTo: '2026-09-26',
        });
    });
});
