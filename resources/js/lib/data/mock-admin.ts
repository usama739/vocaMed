import type { MockDatabase } from './seed';
import type { DataSource } from './source';
import {
    DataError,
    TEMPLATE_VARIABLES,
    type AuditEntry,
    type AvailabilityDraft,
    type Clinic,
    type Doctor,
    type DoctorProfileDraft,
    type Id,
    type Invitation,
    type Role,
    type ServiceInput,
    type StaffInviteInput,
    type TemplateKey,
    type User,
} from './types';
import { DEFAULT_TEMPLATE_BODIES } from './template-defaults';

/** What the admin mutations borrow from the mock "server" in `mock.ts`. */
export interface AdminContext {
    db: MockDatabase;
    clinicId: Id;
    actorId: Id;
    now: () => Date;
    call<T>(work: () => T): Promise<T>;
    own<T extends { clinicId: Id }>(rows: T[]): T[];
    find<T extends { id: Id; clinicId: Id }>(
        rows: T[],
        id: Id,
        label: string,
    ): T;
    nextId(prefix: string): string;
    audit(
        action: string,
        subjectType: AuditEntry['subjectType'],
        subjectId: Id,
        meta?: AuditEntry['meta'],
    ): void;
    clinic(): Clinic;
    assertAdmin(): void;
    normalisePhone(raw: string): string;
    checkDraft(draft: AvailabilityDraft): void;
    persistAvailability(doctor: Doctor, draft: AvailabilityDraft): void;
}

const INVITATION_DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function createAdminMutations(c: AdminContext): Pick<
    DataSource,
    'staff' | 'settings' | 'templates'
> & {
    doctors: Pick<
        DataSource['doctors'],
        'create' | 'save' | 'setActive' | 'invite'
    >;
    services: Pick<DataSource['services'], 'create' | 'update' | 'setActive'>;
} {
    const { db, clinicId, actorId, now, call, own, find, nextId, audit } = c;

    const invalid = (field: string, message: string) =>
        new DataError('VALIDATION', message, [], field);

    // ---- invitations ----

    function invite(
        email: string,
        role: Role,
        doctorId: Id | null,
    ): Invitation {
        const address = email.trim().toLowerCase();

        if (!EMAIL.test(address)) {
            throw invalid('email', 'Enter a valid email address');
        }

        const taken =
            own(db.users).some((u) => u.email.toLowerCase() === address) ||
            own(db.invitations).some(
                (i) =>
                    i.status === 'pending' && i.email.toLowerCase() === address,
            );

        if (taken) {
            throw new DataError(
                'DUPLICATE_EMAIL',
                'That email is already in use',
                [],
                'email',
            );
        }

        const sent = now();
        const invitation: Invitation = {
            id: nextId('inv'),
            clinicId,
            email: address,
            role,
            doctorId,
            status: 'pending',
            sentAt: sent.toISOString(),
            expiresAt: new Date(
                sent.getTime() + INVITATION_DAYS * 86_400_000,
            ).toISOString(),
        };
        db.invitations.push(invitation);
        audit('user.invited', 'user', invitation.id, { email: address, role });

        return invitation;
    }

    // ---- doctors ----

    function profileOf(profile: DoctorProfileDraft) {
        const name = profile.name.trim();

        if (!name) {
            throw invalid('name', 'Enter the doctor’s name');
        }

        const known = new Set(own(db.services).map((s) => s.id));

        return {
            name,
            specialty: profile.specialty.trim(),
            languages: [...new Set(profile.languages)],
            serviceIds: profile.serviceIds.filter((id) => known.has(id)),
            active: profile.active,
        };
    }

    // ---- services ----

    function checkService(input: ServiceInput, selfId: Id | null) {
        const name = input.name.trim();

        if (!name) {
            throw invalid('name', 'Enter a name for this service');
        }

        if (
            own(db.services).some(
                (s) =>
                    s.id !== selfId &&
                    s.name.trim().toLowerCase() === name.toLowerCase(),
            )
        ) {
            throw new DataError(
                'DUPLICATE_NAME',
                'A service with this name already exists',
                [],
                'name',
            );
        }

        if (
            !Number.isInteger(input.durationMin) ||
            input.durationMin < 5 ||
            input.durationMin > 180
        ) {
            throw invalid('durationMin', 'Duration is not valid');
        }

        if (
            !Number.isInteger(input.bufferMin) ||
            input.bufferMin < 0 ||
            input.bufferMin > 60
        ) {
            throw invalid('bufferMin', 'Buffer is not valid');
        }

        return name;
    }

    function offerTo(serviceId: Id, doctorIds: Id[]) {
        for (const doctor of own(db.doctors)) {
            const offers = doctor.serviceIds.includes(serviceId);
            const should = doctorIds.includes(doctor.id);

            if (should && !offers) {
                doctor.serviceIds.push(serviceId);
            } else if (!should && offers) {
                doctor.serviceIds = doctor.serviceIds.filter(
                    (id) => id !== serviceId,
                );
            }
        }
    }

    // ---- templates ----

    function checkBody(body: string): string {
        const text = body.trim();

        if (!text) {
            throw invalid('body', 'Write a message');
        }

        if (text.length > 1000) {
            throw invalid('body', 'The message is too long');
        }

        for (const match of text.matchAll(/\{([^{}]*)\}/g)) {
            if (!(TEMPLATE_VARIABLES as readonly string[]).includes(match[1])) {
                throw new DataError(
                    'UNKNOWN_VARIABLE',
                    `Unknown variable ${match[0]}`,
                    [],
                    'body',
                    match[1],
                );
            }
        }

        return text;
    }

    const templateId = (key: TemplateKey) =>
        `t_${key.kind}_${key.channel}_${key.locale}`;

    return {
        doctors: {
            create: (input) =>
                call(() => {
                    c.assertAdmin();
                    const profile = profileOf(input.profile);
                    c.checkDraft(input.availability);
                    const doctor: Doctor = {
                        id: nextId('d'),
                        clinicId,
                        userId: null,
                        ...profile,
                    };
                    db.doctors.push(doctor);
                    c.persistAvailability(doctor, input.availability);
                    audit('doctor.created', 'doctor', doctor.id);

                    return doctor;
                }),

            save: (id, input) =>
                call(() => {
                    c.assertAdmin();
                    const doctor = find(db.doctors, id, 'Doctor');
                    const profile = profileOf(input.profile);
                    c.checkDraft(input.availability);
                    Object.assign(doctor, profile);
                    c.persistAvailability(doctor, input.availability);
                    audit('doctor.updated', 'doctor', doctor.id);

                    return doctor;
                }),

            setActive: (id, active) =>
                call(() => {
                    c.assertAdmin();
                    const doctor = find(db.doctors, id, 'Doctor');
                    doctor.active = active;
                    audit(
                        active ? 'doctor.activated' : 'doctor.deactivated',
                        'doctor',
                        doctor.id,
                    );

                    return doctor;
                }),

            invite: (id, email) =>
                call(() => {
                    c.assertAdmin();
                    const doctor = find(db.doctors, id, 'Doctor');

                    return invite(email, 'doctor', doctor.id);
                }),
        },

        staff: {
            invite: (input: StaffInviteInput) =>
                call(() => {
                    c.assertAdmin();

                    if (
                        input.role !== 'receptionist' &&
                        input.role !== 'clinic_admin'
                    ) {
                        throw invalid('role', 'Choose a role');
                    }

                    return invite(input.email, input.role, null);
                }),

            resend: (invitationId) =>
                call(() => {
                    c.assertAdmin();
                    const found = find(
                        db.invitations,
                        invitationId,
                        'Invitation',
                    );

                    if (found.status !== 'pending') {
                        throw new DataError(
                            'INVALID_TRANSITION',
                            'This invitation cannot be sent again',
                        );
                    }

                    const sent = now();
                    found.sentAt = sent.toISOString();
                    found.expiresAt = new Date(
                        sent.getTime() + INVITATION_DAYS * 86_400_000,
                    ).toISOString();
                    audit('user.invitation_resent', 'user', found.id, {
                        email: found.email,
                        role: found.role,
                    });

                    return found;
                }),

            revoke: (invitationId) =>
                call(() => {
                    c.assertAdmin();
                    const found = find(
                        db.invitations,
                        invitationId,
                        'Invitation',
                    );

                    if (found.status !== 'pending') {
                        throw new DataError(
                            'INVALID_TRANSITION',
                            'This invitation cannot be revoked',
                        );
                    }

                    found.status = 'revoked';
                    audit('user.revoked', 'user', found.id, {
                        email: found.email,
                        role: found.role,
                    });
                }),

            setActive: (userId, active) =>
                call((): User => {
                    c.assertAdmin();
                    const user = find(db.users, userId, 'User');

                    if (userId === actorId) {
                        throw new DataError(
                            'FORBIDDEN',
                            'You cannot deactivate yourself',
                        );
                    }

                    if (
                        !active &&
                        user.role === 'clinic_admin' &&
                        user.active &&
                        own(db.users).filter(
                            (u) =>
                                u.role === 'clinic_admin' &&
                                u.active &&
                                u.id !== user.id,
                        ).length === 0
                    ) {
                        throw new DataError(
                            'LAST_ADMIN',
                            'The clinic needs at least one active admin',
                        );
                    }

                    user.active = active;
                    audit(
                        active ? 'user.reactivated' : 'user.deactivated',
                        'user',
                        user.id,
                        { email: user.email },
                    );

                    return user;
                }),
        },

        services: {
            create: (input) =>
                call(() => {
                    c.assertAdmin();
                    const name = checkService(input, null);
                    const created = {
                        id: nextId('s'),
                        clinicId,
                        name,
                        durationMin: input.durationMin,
                        bufferMin: input.bufferMin,
                        active: true,
                    };
                    db.services.push(created);
                    offerTo(created.id, input.doctorIds);
                    audit('service.created', 'service', created.id);

                    return created;
                }),

            update: (id, input) =>
                call(() => {
                    c.assertAdmin();
                    const found = find(db.services, id, 'Service');
                    const name = checkService(input, id);
                    found.name = name;
                    found.durationMin = input.durationMin;
                    found.bufferMin = input.bufferMin;
                    offerTo(id, input.doctorIds);
                    audit('service.updated', 'service', id);

                    return found;
                }),

            setActive: (id, active) =>
                call(() => {
                    c.assertAdmin();
                    const found = find(db.services, id, 'Service');
                    found.active = active;
                    audit(
                        active ? 'service.activated' : 'service.deactivated',
                        'service',
                        id,
                    );

                    return found;
                }),
        },

        settings: {
            save: (draft) =>
                call(() => {
                    c.assertAdmin();
                    const clinic = c.clinic();
                    const stored = db.settings.find(
                        (s) => s.clinicId === clinicId,
                    );

                    if (!stored) {
                        throw new DataError('NOT_FOUND', 'Settings not found');
                    }

                    const name = draft.clinic.name.trim();

                    if (!name) {
                        throw invalid('name', 'Enter the clinic’s name');
                    }

                    const phone = c.normalisePhone(draft.clinic.phone);

                    try {
                        new Intl.DateTimeFormat('en', {
                            timeZone: draft.clinic.timezone,
                        });
                    } catch {
                        throw invalid('timezone', 'Choose a timezone');
                    }

                    const next = draft.settings;

                    for (const day of next.businessHours) {
                        const open = toMin(day.open);
                        const close = toMin(day.close);

                        if (
                            !/^\d{2}:(00|30)$/.test(day.open) ||
                            !/^\d{2}:(00|30)$/.test(day.close) ||
                            open < 6 * 60 ||
                            close > 22 * 60 ||
                            open >= close
                        ) {
                            throw invalid(
                                'businessHours',
                                'Business hours are not valid',
                            );
                        }
                    }

                    if (
                        next.holidays.some((h) => !h.date || !h.name.trim()) ||
                        new Set(next.holidays.map((h) => h.date)).size !==
                            next.holidays.length
                    ) {
                        throw invalid('holidays', 'Holidays are not valid');
                    }

                    if (
                        next.reminderHoursBefore.some(
                            (h) => !Number.isInteger(h) || h < 1,
                        ) ||
                        new Set(next.reminderHoursBefore).size !==
                            next.reminderHoursBefore.length
                    ) {
                        throw invalid(
                            'reminderHoursBefore',
                            'Reminders are not valid',
                        );
                    }

                    if (
                        next.cancellationWindowHours !== null &&
                        next.cancellationWindowHours < 0
                    ) {
                        throw invalid(
                            'cancellationWindowHours',
                            'Cancellation window is not valid',
                        );
                    }

                    const sections = [
                        JSON.stringify([
                            name,
                            phone,
                            draft.clinic.address.trim(),
                            draft.clinic.timezone,
                            draft.clinic.defaultLocale,
                        ]) !==
                            JSON.stringify([
                                clinic.name,
                                clinic.phone,
                                clinic.address,
                                clinic.timezone,
                                clinic.defaultLocale,
                            ]) && 'details',
                        JSON.stringify(next.businessHours) !==
                            JSON.stringify(stored.businessHours) && 'hours',
                        JSON.stringify(next.holidays) !==
                            JSON.stringify(stored.holidays) && 'holidays',
                        (JSON.stringify(next.reminderHoursBefore) !==
                            JSON.stringify(stored.reminderHoursBefore) ||
                            next.cancellationWindowHours !==
                                stored.cancellationWindowHours ||
                            next.rescheduleRequiresApproval !==
                                stored.rescheduleRequiresApproval) &&
                            'reminders',
                        (next.voiceEnabled !== stored.voiceEnabled ||
                            next.voiceAudioRetentionDays !==
                                stored.voiceAudioRetentionDays) &&
                            'voice',
                    ].filter(Boolean);

                    clinic.name = name;
                    clinic.phone = phone;
                    clinic.address = draft.clinic.address.trim();
                    clinic.timezone = draft.clinic.timezone;
                    clinic.defaultLocale = draft.clinic.defaultLocale;
                    Object.assign(stored, structuredClone(next));
                    audit('settings.updated', 'settings', clinicId, {
                        section: sections.join(','),
                    });
                }),
        },

        templates: {
            save: (key, body) =>
                call(() => {
                    c.assertAdmin();
                    const text = checkBody(body);
                    const id = templateId(key);
                    const existing = db.templates.find(
                        (t) => t.clinicId === clinicId && t.id === id,
                    );

                    if (
                        text === DEFAULT_TEMPLATE_BODIES[key.kind][key.locale]
                    ) {
                        db.templates = db.templates.filter(
                            (t) => !(t.clinicId === clinicId && t.id === id),
                        );
                    } else if (existing) {
                        existing.body = text;
                    } else {
                        db.templates.push({
                            id,
                            clinicId,
                            ...key,
                            body: text,
                        });
                    }

                    audit('template.updated', 'template', id, { ...key });
                }),

            reset: (key) =>
                call(() => {
                    c.assertAdmin();
                    const id = templateId(key);
                    db.templates = db.templates.filter(
                        (t) => !(t.clinicId === clinicId && t.id === id),
                    );
                    audit('template.reset', 'template', id, { ...key });
                }),

            testSend: (_key, body, phone) =>
                call(() => {
                    c.assertAdmin();
                    checkBody(body);

                    return { sentTo: c.normalisePhone(phone) };
                }),
        },
    };
}
