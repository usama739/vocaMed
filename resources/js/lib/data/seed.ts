import { addDays, utcToZoned, zonedToUtc } from './time';
import type {
    Appointment,
    AppointmentStatus,
    AuditEntry,
    Clinic,
    ClinicSettings,
    Doctor,
    DoctorAvailability,
    Id,
    Invitation,
    NotificationLogEntry,
    NotificationTemplate,
    Patient,
    PatientReply,
    RescheduleRequest,
    Service,
    SlotHold,
    User,
    WorkingWindow,
    BookingSource,
} from './types';

/** Everything the mock needs, for every clinic. Real data will be per-clinic on the server. */
export interface MockDatabase {
    clinics: Clinic[];
    settings: ClinicSettings[];
    users: User[];
    invitations: Invitation[];
    services: Service[];
    doctors: Doctor[];
    availability: DoctorAvailability[];
    patients: Patient[];
    appointments: Appointment[];
    holds: SlotHold[];
    notifications: NotificationLogEntry[];
    replies: PatientReply[];
    requests: RescheduleRequest[];
    templates: NotificationTemplate[];
    audit: AuditEntry[];
    /** Signed-link token → appointment. `expired` links resolve to the E4 state. */
    links: Map<string, { appointmentId: Id; clinicId: Id; expired: boolean }>;
    seq: number;
}

export const DEMO_CLINIC_ID = 'clinic_shifa';
export const OTHER_CLINIC_ID = 'clinic_noor';

const weekdayWindow = (
    weekday: number,
    start: string,
    end: string,
    breaks: WorkingWindow['breaks'],
): WorkingWindow => ({
    weekday,
    start,
    end,
    breaks,
});

const lunch = [{ start: '13:00', end: '14:00' }];

export function createSeedDatabase(now: Date = new Date()): MockDatabase {
    const iso = now.toISOString();
    const tz = 'Asia/Karachi';
    const today = utcToZoned(now, tz).date;

    const clinics: Clinic[] = [
        {
            id: DEMO_CLINIC_ID,
            name: 'Shifa Family Clinic',
            country: 'PK',
            phoneCountryCode: '+92',
            timezone: tz,
            defaultLocale: 'ur',
            address: '14 Khayaban-e-Iqbal, Clifton, Karachi',
            phone: '+922135001122',
        },
        {
            id: OTHER_CLINIC_ID,
            name: 'Noor Medical Centre',
            country: 'PK',
            phoneCountryCode: '+92',
            timezone: tz,
            defaultLocale: 'en',
            address: '7 Main Boulevard, Gulberg, Lahore',
            phone: '+924235007788',
        },
    ];

    const settings: ClinicSettings[] = clinics.map((c) => ({
        clinicId: c.id,
        businessHours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            open: '09:00',
            close: '17:00',
        })),
        holidays: [{ date: addDays(today, 19), name: 'Public holiday' }],
        reminderHoursBefore: [24, 2],
        cancellationWindowHours: 4,
        rescheduleRequiresApproval: false,
        voiceEnabled: true,
        voiceAudioRetentionDays: 30,
    }));

    const users: User[] = [
        {
            id: 'u_admin',
            clinicId: DEMO_CLINIC_ID,
            name: 'Ayesha Khan',
            email: 'ayesha@shifa.example',
            role: 'clinic_admin',
            active: true,
            locale: 'en',
        },
        {
            id: 'u_recep',
            clinicId: DEMO_CLINIC_ID,
            name: 'Bilal Ahmed',
            email: 'bilal@shifa.example',
            role: 'receptionist',
            active: true,
            locale: 'ur',
        },
        {
            id: 'u_doc1',
            clinicId: DEMO_CLINIC_ID,
            name: 'Dr. Sana Malik',
            email: 'sana@shifa.example',
            role: 'doctor',
            active: true,
            locale: 'en',
        },
        {
            id: 'u_doc2',
            clinicId: DEMO_CLINIC_ID,
            name: 'Dr. Imran Qureshi',
            email: 'imran@shifa.example',
            role: 'doctor',
            active: true,
            locale: 'ur',
        },
        {
            id: 'u_noor_admin',
            clinicId: OTHER_CLINIC_ID,
            name: 'Farah Siddiqui',
            email: 'farah@noor.example',
            role: 'clinic_admin',
            active: true,
            locale: 'en',
        },
    ];

    const invitations: Invitation[] = [
        {
            id: 'inv_1',
            clinicId: DEMO_CLINIC_ID,
            email: 'newdesk@shifa.example',
            role: 'receptionist',
            status: 'pending',
            sentAt: iso,
        },
    ];

    const services: Service[] = [
        {
            id: 's_general',
            clinicId: DEMO_CLINIC_ID,
            name: 'General consultation',
            durationMin: 20,
            bufferMin: 5,
            active: true,
        },
        {
            id: 's_followup',
            clinicId: DEMO_CLINIC_ID,
            name: 'Follow-up visit',
            durationMin: 10,
            bufferMin: 0,
            active: true,
        },
        {
            id: 's_child',
            clinicId: DEMO_CLINIC_ID,
            name: 'Child check-up',
            durationMin: 20,
            bufferMin: 5,
            active: true,
        },
        {
            id: 's_noor_general',
            clinicId: OTHER_CLINIC_ID,
            name: 'General consultation',
            durationMin: 15,
            bufferMin: 0,
            active: true,
        },
    ];

    const doctors: Doctor[] = [
        {
            id: 'd_sana',
            clinicId: DEMO_CLINIC_ID,
            userId: 'u_doc1',
            name: 'Dr. Sana Malik',
            specialty: 'General Physician',
            languages: ['en', 'ur'],
            serviceIds: ['s_general', 's_followup'],
            active: true,
        },
        {
            id: 'd_imran',
            clinicId: DEMO_CLINIC_ID,
            userId: 'u_doc2',
            name: 'Dr. Imran Qureshi',
            specialty: 'Paediatrics',
            languages: ['ur'],
            serviceIds: ['s_child', 's_followup'],
            active: true,
        },
        {
            id: 'd_hina',
            clinicId: DEMO_CLINIC_ID,
            userId: null,
            name: 'Dr. Hina Farooq',
            specialty: 'Dermatology',
            languages: ['en', 'ur'],
            serviceIds: ['s_general'],
            active: true,
        },
        {
            id: 'd_noor',
            clinicId: OTHER_CLINIC_ID,
            userId: null,
            name: 'Dr. Tariq Mehmood',
            specialty: 'General Physician',
            languages: ['en'],
            serviceIds: ['s_noor_general'],
            active: true,
        },
    ];

    const fullWeek = (
        start: string,
        end: string,
        breaks: WorkingWindow['breaks'],
    ) => [1, 2, 3, 4, 5, 6].map((d) => weekdayWindow(d, start, end, breaks));

    const availability: DoctorAvailability[] = [
        {
            doctorId: 'd_sana',
            windows: fullWeek('09:00', '17:00', lunch),
            timeOff: [
                {
                    id: 'to_sana',
                    doctorId: 'd_sana',
                    startDate: addDays(today, 17),
                    endDate: addDays(today, 18),
                    reason: 'Conference',
                },
            ],
            // Every Monday 12:00 is kept free for ward rounds.
            blocked: [{ weekday: 1, time: '12:00' }],
        },
        {
            doctorId: 'd_imran',
            windows: fullWeek('10:00', '18:00', lunch),
            timeOff: [],
            blocked: [],
        },
        {
            doctorId: 'd_hina',
            windows: [1, 3, 5].map((d) =>
                weekdayWindow(d, '10:00', '15:00', []),
            ),
            timeOff: [
                {
                    id: 'to_1',
                    doctorId: 'd_hina',
                    startDate: addDays(today, 7),
                    endDate: addDays(today, 9),
                    reason: 'Conference',
                },
            ],
            blocked: [],
        },
        {
            doctorId: 'd_noor',
            windows: fullWeek('09:00', '15:00', []),
            timeOff: [],
            blocked: [],
        },
    ];

    const person = (
        n: number,
        clinicId: Id,
        name: string,
        phone: string,
        extra: Partial<Patient> = {},
    ): Patient => ({
        id: `p_${n}`,
        clinicId,
        name,
        phone,
        preferredLocale: 'ur',
        preferredChannel: 'sms',
        consent: true,
        noShowCount: 0,
        notes: '',
        createdAt: iso,
        ...extra,
    });

    const patients: Patient[] = [
        person(1, DEMO_CLINIC_ID, 'Muhammad Usman', '+923001234567'),
        person(2, DEMO_CLINIC_ID, 'Fatima Zahra', '+923121234568', {
            preferredLocale: 'en',
            preferredChannel: 'whatsapp',
        }),
        person(3, DEMO_CLINIC_ID, 'Ali Raza', '+923331234569', {
            noShowCount: 2,
            notes: 'Prefers morning slots',
        }),
        person(4, DEMO_CLINIC_ID, 'Zainab Hussain', '+923451234570'),
        person(5, DEMO_CLINIC_ID, 'Hamza Sheikh', '+923211234571', {
            preferredLocale: 'en',
        }),
        person(6, DEMO_CLINIC_ID, 'Maryam Aslam', '+923011234572', {
            consent: false,
        }),
        person(7, DEMO_CLINIC_ID, 'Bilqees Bano', '+923471234573'),
        person(8, DEMO_CLINIC_ID, 'Omar Farooq', '+923151234574', {
            preferredLocale: 'en',
        }),
        person(11, DEMO_CLINIC_ID, 'سعدیہ نور', '+923001112233'),
        person(12, DEMO_CLINIC_ID, 'عمران قریشی', '+923211112244', {
            preferredChannel: 'whatsapp',
        }),
        person(13, DEMO_CLINIC_ID, 'بشیر احمد', '+923331112255', {
            notes: 'Brings his daughter along',
        }),
        person(14, DEMO_CLINIC_ID, 'Nida Kamal', '+923451112266', {
            preferredLocale: 'en',
            preferredChannel: 'whatsapp',
        }),
        person(9, OTHER_CLINIC_ID, 'Saad Mirza', '+923001234567', {
            preferredLocale: 'en',
        }),
        person(10, OTHER_CLINIC_ID, 'Nadia Iqbal', '+923221234575', {
            preferredLocale: 'en',
        }),
    ];

    const durationOf = (serviceId: Id) =>
        services.find((s) => s.id === serviceId)?.durationMin ?? 15;

    let n = 0;
    const appt = (
        clinicId: Id,
        patientId: Id,
        doctorId: Id,
        serviceId: Id,
        dayOffset: number,
        time: string,
        status: AppointmentStatus,
        source: BookingSource = 'manual',
        reason: string | null = null,
    ): Appointment => {
        n += 1;
        const start = zonedToUtc(addDays(today, dayOffset), time, tz);
        const end = new Date(start.getTime() + durationOf(serviceId) * 60_000);

        return {
            id: `a_${String(n).padStart(3, '0')}`,
            clinicId,
            patientId,
            doctorId,
            serviceId,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            status,
            source,
            reason,
            notes: null,
            createdAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
            createdBy: source === 'patient_link' ? 'patient' : 'u_recep',
        };
    };

    const appointments: Appointment[] = [
        appt(
            DEMO_CLINIC_ID,
            'p_1',
            'd_sana',
            's_general',
            0,
            '09:00',
            'done',
            'manual',
            'Fever and cough',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_2',
            'd_sana',
            's_general',
            0,
            '09:30',
            'in_consultation',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_3',
            'd_sana',
            's_followup',
            0,
            '10:00',
            'arrived',
            'walk_in',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_4',
            'd_sana',
            's_general',
            0,
            '10:30',
            'confirmed',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_5',
            'd_imran',
            's_child',
            0,
            '10:00',
            'booked',
            'manual',
            'Vaccination',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_6',
            'd_imran',
            's_child',
            0,
            '10:30',
            'no_show',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_7',
            'd_imran',
            's_followup',
            1,
            '11:00',
            'booked',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_8',
            'd_sana',
            's_general',
            1,
            '09:00',
            'confirmed',
            'patient_link',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_1',
            'd_sana',
            's_followup',
            2,
            '15:00',
            'cancelled',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_2',
            'd_hina',
            's_general',
            3,
            '11:00',
            'booked',
        ),
        appt(
            OTHER_CLINIC_ID,
            'p_9',
            'd_noor',
            's_noor_general',
            0,
            '09:00',
            'booked',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_11',
            'd_imran',
            's_followup',
            0,
            '11:00',
            'confirmed',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_12',
            'd_sana',
            's_general',
            -1,
            '09:30',
            'done',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_5',
            'd_sana',
            's_general',
            -1,
            '10:00',
            'done',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_3',
            'd_imran',
            's_child',
            -1,
            '11:00',
            'cancelled',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_13',
            'd_hina',
            's_general',
            -2,
            '11:00',
            'done',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_4',
            'd_sana',
            's_followup',
            -3,
            '14:00',
            'cancelled',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_14',
            'd_imran',
            's_child',
            -5,
            '12:00',
            'done',
            'walk_in',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_12',
            'd_sana',
            's_general',
            1,
            '10:00',
            'booked',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_6',
            'd_sana',
            's_followup',
            2,
            '09:30',
            'confirmed',
            'voice',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_13',
            'd_imran',
            's_child',
            2,
            '14:00',
            'booked',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_5',
            'd_hina',
            's_general',
            4,
            '12:00',
            'confirmed',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_14',
            'd_sana',
            's_general',
            5,
            '11:00',
            'booked',
            'patient_link',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_7',
            'd_sana',
            's_general',
            0,
            '11:20',
            'booked',
        ),
        appt(
            DEMO_CLINIC_ID,
            'p_8',
            'd_sana',
            's_general',
            0,
            '11:40',
            'confirmed',
            'voice',
        ),
    ];

    const at = (hoursAgo: number) =>
        new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
    const channelOf = (patientId: Id) =>
        patients.find((p) => p.id === patientId)?.preferredChannel ?? 'sms';

    const notifications: NotificationLogEntry[] = appointments
        .filter((a) => a.status !== 'cancelled')
        .map((a, i) => {
            const channel = channelOf(a.patientId);
            const status: NotificationLogEntry['status'] =
                i % 5 === 4
                    ? 'failed'
                    : i % 7 === 6
                      ? 'queued'
                      : i % 2 === 0
                        ? 'delivered'
                        : 'sent';
            const created = at(2 + (i % 4) * 20 + i);

            return {
                id: `n_${String(i + 1).padStart(3, '0')}`,
                clinicId: a.clinicId,
                appointmentId: a.id,
                patientId: a.patientId,
                kind: 'confirmation' as const,
                channel,
                status,
                createdAt: created,
                sentAt: status === 'queued' ? null : created,
                ...(status === 'failed'
                    ? {
                          failureReason:
                              channel === 'whatsapp'
                                  ? ('not_on_whatsapp' as const)
                                  : ('unreachable' as const),
                      }
                    : {}),
            };
        });

    // Confirmed appointments also had a reminder, and the patient answered the confirmation.
    const replies: PatientReply[] = [];
    appointments
        .filter((a) => a.status === 'confirmed' || a.status === 'arrived')
        .forEach((a, i) => {
            notifications.push({
                id: `n_r${String(i + 1).padStart(3, '0')}`,
                clinicId: a.clinicId,
                appointmentId: a.id,
                patientId: a.patientId,
                kind: 'reminder',
                channel: channelOf(a.patientId),
                status: 'delivered',
                createdAt: at(3 + i),
                sentAt: at(3 + i),
            });
            replies.push({
                id: `r_${String(i + 1).padStart(3, '0')}`,
                clinicId: a.clinicId,
                appointmentId: a.id,
                patientId: a.patientId,
                at: at(30 + i),
                action: 'confirm',
            });
        });

    const requestFor = (
        n: number,
        appointmentId: Id,
        dayOffset: number,
        time: string,
        status: RescheduleRequest['status'],
        message: string | null,
        hoursAgo: number,
    ): RescheduleRequest => {
        const a = appointments.find((x) => x.id === appointmentId)!;

        return {
            id: `rq_${n}`,
            clinicId: a.clinicId,
            appointmentId,
            patientId: a.patientId,
            doctorId: a.doctorId,
            fromStartsAt: a.startsAt,
            proposedStartsAt: zonedToUtc(
                addDays(today, dayOffset),
                time,
                tz,
            ).toISOString(),
            status,
            message,
            createdAt: at(hoursAgo),
            decidedAt: status === 'pending' ? null : at(hoursAgo - 1),
        };
    };
    const requests: RescheduleRequest[] = [
        requestFor(1, 'a_019', 3, '09:40', 'pending', null, 5),
        requestFor(2, 'a_020', 4, '14:20', 'pending', null, 3),
        requestFor(3, 'a_013', 1, '10:20', 'approved', 'OK', 72),
        requestFor(
            4,
            'a_017',
            0,
            '16:40',
            'rejected',
            'No slots that evening',
            96,
        ),
    ];

    const auditLog: AuditEntry[] = appointments
        .filter((a) => a.clinicId === DEMO_CLINIC_ID)
        .flatMap((a) => {
            const created: AuditEntry = {
                id: `au_${a.id}_c`,
                clinicId: a.clinicId,
                actorId: a.createdBy,
                action: 'appointment.created',
                subjectType: 'appointment',
                subjectId: a.id,
                at: a.createdAt,
                meta: { source: a.source },
            };
            const confirmed: AuditEntry | null =
                a.status === 'confirmed'
                    ? {
                          id: `au_${a.id}_k`,
                          clinicId: a.clinicId,
                          actorId: 'patient',
                          action: 'appointment.status_changed',
                          subjectType: 'appointment',
                          subjectId: a.id,
                          at: new Date(
                              new Date(a.createdAt).getTime() + 3_600_000,
                          ).toISOString(),
                          meta: { status: 'confirmed', from: 'booked' },
                      }
                    : null;

            return confirmed ? [confirmed, created] : [created];
        });

    const templates: NotificationTemplate[] = (['en', 'ur'] as const).flatMap(
        (locale) =>
            (['confirmation', 'reminder'] as const).map((kind) => ({
                id: `t_${kind}_${locale}`,
                clinicId: DEMO_CLINIC_ID,
                kind,
                channel: 'sms' as const,
                locale,
                body:
                    locale === 'en'
                        ? kind === 'confirmation'
                            ? 'Hello {patient_name}, your appointment with {doctor} is booked for {time}.'
                            : 'Reminder: {patient_name}, you have an appointment with {doctor} at {time}.'
                        : kind === 'confirmation'
                          ? 'السلام علیکم {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر بک ہو گئی ہے۔'
                          : 'یاد دہانی: {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر ہے۔',
            })),
    );

    const links = new Map<
        string,
        { appointmentId: Id; clinicId: Id; expired: boolean }
    >();
    for (const a of appointments) {
        links.set(`tok_${a.id}`, {
            appointmentId: a.id,
            clinicId: a.clinicId,
            expired: false,
        });
    }
    links.set('tok_expired', {
        appointmentId: appointments[0].id,
        clinicId: DEMO_CLINIC_ID,
        expired: true,
    });

    return {
        clinics,
        settings,
        users,
        invitations,
        services,
        doctors,
        availability,
        patients,
        appointments,
        holds: [],
        notifications,
        replies,
        requests,
        templates,
        audit: auditLog,
        links,
        seq: 1000,
    };
}
