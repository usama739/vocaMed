import { afterEach, describe, expect, it, vi } from 'vitest';
import doctorAvailability from '../../../../tests/fixtures/doctor-availability-view.json';
import adminAudit from '../../../../tests/fixtures/admin-audit-view.json';
import adminDoctor from '../../../../tests/fixtures/admin-doctor-view.json';
import adminDoctors from '../../../../tests/fixtures/admin-doctors-view.json';
import adminServices from '../../../../tests/fixtures/admin-services-view.json';
import adminSettings from '../../../../tests/fixtures/admin-settings-view.json';
import adminStaff from '../../../../tests/fixtures/admin-staff-view.json';
import adminTemplates from '../../../../tests/fixtures/admin-templates-view.json';
import invitation from '../../../../tests/fixtures/invitation.json';
import { createHttpSource } from './http-source';
import type { DataSource } from './source';
import { DataError, type AvailabilityDraft } from './types';

type Call = { url: string; init: RequestInit };

/** A fetch that answers every request with one status and body, and remembers what it was asked. */
function fakeFetch(status: number, body: unknown = {}) {
    const calls: Call[] = [];
    const impl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });

        return Promise.resolve(
            new Response(body === null ? null : JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    }) as unknown as typeof fetch;

    return { impl, calls };
}

/** Stands in for the sample-data source: only what the test looks at. */
const mock = {
    clinicId: 'mock',
    views: { today: vi.fn(), adminOverview: vi.fn() },
    doctors: { list: vi.fn(), get: vi.fn(), me: vi.fn() },
    services: { list: vi.fn() },
    appointments: { list: vi.fn() },
} as unknown as DataSource;

const sourceWith = (status: number, body: unknown = {}) => {
    const { impl, calls } = fakeFetch(status, body);

    return { source: createHttpSource(mock, impl), calls };
};

const sent = (call: Call) => JSON.parse(String(call.init.body));

const caught = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the call to fail');
};

afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const DRAFT = adminDoctor.draft as unknown as AvailabilityDraft;

describe('the real staff source: what the pages read', () => {
    it('reads each admin page from its address and hands the screen exactly what the server sent', async () => {
        const cases: [string, unknown, (s: DataSource) => Promise<unknown>][] =
            [
                [
                    '/admin/doctors?status=all',
                    adminDoctors,
                    (s) => s.views.adminDoctors({ status: 'all' }),
                ],
                ['/admin/staff', adminStaff, (s) => s.views.adminStaff()],
                [
                    '/admin/services',
                    adminServices,
                    (s) => s.views.adminServices(),
                ],
                [
                    '/admin/settings',
                    adminSettings,
                    (s) => s.views.adminSettings(),
                ],
                [
                    '/admin/templates',
                    adminTemplates,
                    (s) => s.views.adminTemplates(),
                ],
                [
                    '/doctor/availability',
                    doctorAvailability,
                    (s) => s.views.availability(),
                ],
            ];

        for (const [url, fixture, read] of cases) {
            const { source, calls } = sourceWith(200, fixture);

            expect(await read(source)).toEqual(fixture);
            expect(calls[0].url).toBe(url);
            expect(calls[0].init.method).toBe('GET');
        }
    });

    it('sends the doctors search and status, and the audit filters, in the query', async () => {
        const doctors = sourceWith(200, adminDoctors);
        await doctors.source.views.adminDoctors({
            q: 'sana ali',
            status: 'active',
        });
        expect(doctors.calls[0].url).toBe(
            '/admin/doctors?q=sana%20ali&status=active',
        );

        const audit = sourceWith(200, adminAudit);
        const view = await audit.source.views.adminAudit({
            days: 7,
            userId: '7',
            category: 'invite',
            page: 2,
        });
        expect(audit.calls[0].url).toBe(
            '/admin/audit?days=7&userId=7&category=invite&page=2',
        );
        expect(view).toEqual(adminAudit);

        const bare = sourceWith(200, adminAudit);
        await bare.source.views.adminAudit({ days: 1, page: 1 });
        expect(bare.calls[0].url).toBe('/admin/audit?days=1&page=1');
    });

    it('reads one doctor, the blank form, and a doctor who does not exist as null', async () => {
        const one = sourceWith(200, adminDoctor);
        expect(await one.source.views.adminDoctor({ doctorId: 'abc' })).toEqual(
            adminDoctor,
        );
        expect(one.calls[0].url).toBe('/admin/doctors/abc');

        const blank = sourceWith(200, { ...adminDoctor, id: null });
        await blank.source.views.adminDoctor({ doctorId: 'new' });
        expect(blank.calls[0].url).toBe('/admin/doctors/new');

        const missing = sourceWith(404, { code: 'NOT_FOUND' });
        expect(
            await missing.source.views.adminDoctor({ doctorId: 'nope' }),
        ).toBeNull();
    });

    it('leaves everything that is not clinic setup to the sample-data source', () => {
        const { source } = sourceWith(200);

        expect(source.views.today).toBe(mock.views.today);
        expect(source.views.adminOverview).toBe(mock.views.adminOverview);
        expect(source.doctors.list).toBe(mock.doctors.list);
        expect(source.doctors.me).toBe(mock.doctors.me);
        expect(source.services.list).toBe(mock.services.list);
        expect(source.appointments).toBe(mock.appointments);
        expect(source.clinicId).toBe('mock');
    });
});

describe('the real staff source: what the pages save', () => {
    it('saves settings, services, doctors and availability with the right method, address and body', async () => {
        const settings = sourceWith(200, { ok: true });
        const draft = {
            clinic: {
                name: 'A',
                phone: '',
                address: '',
                timezone: 'Asia/Karachi',
                defaultLocale: 'en' as const,
            },
            settings: {
                businessHours: [],
                holidays: [],
                reminderHoursBefore: [24],
                cancellationWindowHours: null,
                rescheduleRequiresApproval: false,
                voiceEnabled: false,
                voiceAudioRetentionDays: 0,
            },
        };
        await settings.source.settings.save(draft);
        expect(settings.calls[0]).toMatchObject({
            url: '/admin/settings',
            init: { method: 'PUT' },
        });
        expect(sent(settings.calls[0])).toEqual(draft);

        const service = sourceWith(201, adminServices.services[0].service);
        await service.source.services.create({
            name: 'Check-up',
            durationMin: 30,
            bufferMin: 10,
            doctorIds: ['d1'],
        });
        expect(service.calls[0]).toMatchObject({
            url: '/admin/services',
            init: { method: 'POST' },
        });
        expect(sent(service.calls[0])).toEqual({
            name: 'Check-up',
            durationMin: 30,
            bufferMin: 10,
            doctorIds: ['d1'],
        });

        const update = sourceWith(200, adminServices.services[0].service);
        await update.source.services.update('s1', {
            name: 'X',
            durationMin: 15,
            bufferMin: 0,
            doctorIds: [],
        });
        expect(update.calls[0]).toMatchObject({
            url: '/admin/services/s1',
            init: { method: 'PUT' },
        });

        const toggle = sourceWith(200, adminServices.services[0].service);
        await toggle.source.services.setActive('s1', false);
        expect(toggle.calls[0]).toMatchObject({
            url: '/admin/services/s1',
            init: { method: 'PATCH' },
        });
        expect(sent(toggle.calls[0])).toEqual({ active: false });

        const doctor = sourceWith(201, adminDoctors.rows[0].doctor);
        const input = {
            profile: adminDoctor.profile,
            availability: DRAFT,
        } as never;
        await doctor.source.doctors.create(input);
        expect(doctor.calls[0]).toMatchObject({
            url: '/admin/doctors',
            init: { method: 'POST' },
        });

        const save = sourceWith(200, adminDoctors.rows[0].doctor);
        await save.source.doctors.save('d1', input);
        expect(save.calls[0]).toMatchObject({
            url: '/admin/doctors/d1',
            init: { method: 'PUT' },
        });

        const active = sourceWith(200, adminDoctors.rows[0].doctor);
        await active.source.doctors.setActive('d1', false);
        expect(sent(active.calls[0])).toEqual({ active: false });
    });

    it('saves availability as the admin for a doctor, or as the doctor for themselves, and previews both ways', async () => {
        const asAdmin = sourceWith(200, { ok: true });
        await asAdmin.source.doctors.saveAvailability(DRAFT, 'd1');
        expect(asAdmin.calls[0]).toMatchObject({
            url: '/admin/doctors/d1/availability',
            init: { method: 'PUT' },
        });
        expect(sent(asAdmin.calls[0])).toEqual(DRAFT);

        const asDoctor = sourceWith(200, { ok: true });
        await asDoctor.source.doctors.saveAvailability(DRAFT);
        expect(asDoctor.calls[0]).toMatchObject({
            url: '/doctor/availability',
            init: { method: 'PUT' },
        });

        const preview = {
            slotsPerWeekday: [1, 2, 3, 4, 5, 6, 7],
            total: 28,
            affected: [],
        };
        const adminPreview = sourceWith(200, preview);
        expect(
            await adminPreview.source.doctors.previewAvailability(DRAFT, 'new'),
        ).toEqual(preview);
        expect(adminPreview.calls[0].url).toBe(
            '/admin/doctors/new/availability/preview',
        );

        const doctorPreview = sourceWith(200, preview);
        await doctorPreview.source.doctors.previewAvailability(DRAFT);
        expect(doctorPreview.calls[0].url).toBe('/doctor/availability/preview');
    });

    it('invites, resends, revokes and switches staff', async () => {
        const invite = sourceWith(201, invitation);
        expect(
            await invite.source.staff.invite({
                email: 'a@b.test',
                role: 'receptionist',
            }),
        ).toEqual(invitation);
        expect(invite.calls[0]).toMatchObject({
            url: '/admin/staff/invite',
            init: { method: 'POST' },
        });
        expect(sent(invite.calls[0])).toEqual({
            email: 'a@b.test',
            role: 'receptionist',
        });

        const resend = sourceWith(200, invitation);
        await resend.source.staff.resend('i1');
        expect(resend.calls[0]).toMatchObject({
            url: '/admin/staff/i1/resend',
            init: { method: 'POST' },
        });

        const revoke = sourceWith(200, { ok: true });
        await revoke.source.staff.revoke('i1');
        expect(revoke.calls[0]).toMatchObject({
            url: '/admin/staff/i1/invite',
            init: { method: 'DELETE' },
        });

        const off = sourceWith(200, { id: '7', active: false });
        await off.source.staff.setActive('7', false);
        expect(off.calls[0]).toMatchObject({
            url: '/admin/staff/7/deactivate',
            init: { method: 'PATCH' },
        });
        expect(sent(off.calls[0])).toEqual({ active: false });

        const doctor = sourceWith(201, {
            ...invitation,
            role: 'doctor',
            doctorId: 'd1',
        });
        await doctor.source.doctors.invite('d1', 'doc@b.test');
        expect(doctor.calls[0]).toMatchObject({
            url: '/admin/doctors/d1/invite',
            init: { method: 'POST' },
        });
        expect(sent(doctor.calls[0])).toEqual({ email: 'doc@b.test' });
    });

    it('saves, resets and test-sends a template by its kind, channel and language', async () => {
        const key = { kind: 'reminder', channel: 'sms', locale: 'en' } as const;

        const save = sourceWith(200, { ok: true });
        await save.source.templates.save(key, 'Hi {patient_name}');
        expect(save.calls[0]).toMatchObject({
            url: '/admin/templates',
            init: { method: 'PUT' },
        });
        expect(sent(save.calls[0])).toEqual({
            ...key,
            body: 'Hi {patient_name}',
        });

        const reset = sourceWith(200, { ok: true });
        await reset.source.templates.reset(key);
        expect(reset.calls[0]).toMatchObject({
            url: '/admin/templates',
            init: { method: 'DELETE' },
        });
        expect(sent(reset.calls[0])).toEqual(key);

        const test = sourceWith(200, { sentTo: '+923001234567' });
        expect(
            await test.source.templates.testSend(key, 'Hi', '0300 1234567'),
        ).toEqual({ sentTo: '+923001234567' });
        expect(sent(test.calls[0])).toEqual({
            ...key,
            body: 'Hi',
            phone: '0300 1234567',
        });
    });
});

describe('the real staff source: when something is refused', () => {
    it('turns each answer a screen has a state for into its DataError, with field and detail', async () => {
        const cases: [
            number,
            Record<string, unknown>,
            Record<string, unknown>,
        ][] = [
            [
                422,
                { code: 'DUPLICATE_EMAIL', field: 'email', message: 'x' },
                { code: 'DUPLICATE_EMAIL', field: 'email' },
            ],
            [
                422,
                { code: 'DUPLICATE_NAME', field: 'name', message: 'x' },
                { code: 'DUPLICATE_NAME', field: 'name' },
            ],
            [422, { code: 'LAST_ADMIN', message: 'x' }, { code: 'LAST_ADMIN' }],
            [
                422,
                {
                    code: 'UNKNOWN_VARIABLE',
                    field: 'body',
                    detail: 'room',
                    message: 'x',
                },
                { code: 'UNKNOWN_VARIABLE', field: 'body', detail: 'room' },
            ],
            [
                422,
                { code: 'VALIDATION', field: 'days', message: 'x' },
                { code: 'VALIDATION', field: 'days' },
            ],
            [
                422,
                { code: 'INVALID_PHONE', field: 'phone', message: 'x' },
                { code: 'INVALID_PHONE', field: 'phone' },
            ],
            [403, { code: 'FORBIDDEN', message: 'x' }, { code: 'FORBIDDEN' }],
            [404, { code: 'NOT_FOUND', message: 'x' }, { code: 'NOT_FOUND' }],
        ];

        for (const [status, body, expected] of cases) {
            const { source } = sourceWith(status, body);
            const error = await caught(
                source.staff.invite({
                    email: 'a@b.test',
                    role: 'receptionist',
                }),
            );

            expect(error).toBeInstanceOf(DataError);
            expect(error).toMatchObject(expected);
        }
    });

    it('reads too many tries as RATE_LIMITED and rejects with a plain error on a server failure', async () => {
        const limited = await caught(
            sourceWith(429, {}).source.views.adminStaff(),
        );
        expect(limited).toMatchObject({ code: 'RATE_LIMITED' });

        for (const status of [500, 419]) {
            const failed = await caught(
                sourceWith(status).source.views.adminStaff(),
            );
            expect(failed).toBeInstanceOf(Error);
            expect(failed).not.toBeInstanceOf(DataError);
        }

        const odd = await caught(sourceWith(409, {}).source.views.adminStaff());
        expect(odd).not.toBeInstanceOf(DataError);
    });
});
