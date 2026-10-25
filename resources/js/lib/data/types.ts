/**
 * Domain types for the VocaMed front end.
 *
 * These mirror what the Laravel backend will return once the mock layer is
 * replaced. Every record that belongs to a tenant carries `clinicId`; a data
 * source is always bound to exactly one clinic.
 * Instants are ISO-8601 UTC strings; clinic-local wall time is derived with the clinic timezone.
 */

export type Id = string;
export type IsoDateTime = string; // 2026-10-26T04:30:00.000Z
export type IsoDate = string; // 2026-10-26 (clinic-local calendar date)
export type TimeOfDay = string; // 09:30 (clinic-local, 24h)

export type Locale = 'en' | 'ur';
export type Channel = 'sms' | 'whatsapp';
export type Role = 'clinic_admin' | 'receptionist' | 'doctor';

export type AppointmentStatus =
    | 'booked'
    | 'confirmed'
    | 'arrived'
    | 'in_consultation'
    | 'done'
    | 'cancelled'
    | 'no_show';

export type BookingSource = 'voice' | 'manual' | 'walk_in' | 'patient_link';

export interface Clinic {
    id: Id;
    name: string;
    country: string; // ISO 3166-1 alpha-2
    phoneCountryCode: string; // +92
    timezone: string; // IANA, e.g. Asia/Karachi
    defaultLocale: Locale;
    address: string;
    phone: string;
}

export interface BusinessHours {
    weekday: number; // 0 = Sunday … 6 = Saturday
    open: TimeOfDay;
    close: TimeOfDay;
}

export interface ClinicSettings {
    clinicId: Id;
    businessHours: BusinessHours[];
    holidays: { date: IsoDate; name: string }[];
    reminderHoursBefore: number[]; // e.g. [24, 2]
    cancellationWindowHours: number;
    rescheduleRequiresApproval: boolean;
    voiceEnabled: boolean;
    voiceAudioRetentionDays: number;
}

export interface User {
    id: Id;
    clinicId: Id;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    locale: Locale;
}

export interface Invitation {
    id: Id;
    clinicId: Id;
    email: string;
    role: Role;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    sentAt: IsoDateTime;
}

export interface Service {
    id: Id;
    clinicId: Id;
    name: string;
    durationMin: number;
    bufferMin: number;
    active: boolean;
}

export interface Doctor {
    id: Id;
    clinicId: Id;
    userId: Id | null;
    name: string;
    specialty: string;
    languages: Locale[];
    serviceIds: Id[];
    active: boolean;
}

export interface WorkingWindow {
    weekday: number;
    start: TimeOfDay;
    end: TimeOfDay;
    breaks: { start: TimeOfDay; end: TimeOfDay }[];
}

export interface TimeOff {
    id: Id;
    doctorId: Id;
    startDate: IsoDate;
    endDate: IsoDate;
    reason: string;
}

export interface DoctorAvailability {
    doctorId: Id;
    windows: WorkingWindow[];
    timeOff: TimeOff[];
}

export interface Patient {
    id: Id;
    clinicId: Id;
    name: string;
    phone: string; // E.164, e.g. +923001234567
    preferredLocale: Locale;
    preferredChannel: Channel;
    consent: boolean;
    noShowCount: number;
    notes: string; // non-clinical only
    createdAt: IsoDateTime;
}

export interface Appointment {
    id: Id;
    clinicId: Id;
    patientId: Id;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    endsAt: IsoDateTime;
    status: AppointmentStatus;
    source: BookingSource;
    reason: string | null; // optional visit reason; never clinical notes
    notes: string | null;
    createdAt: IsoDateTime;
}

export type SlotState = 'free' | 'held';

export interface Slot {
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    endsAt: IsoDateTime;
    state: SlotState;
    /** For held slots: true when the current user holds it, so the UI keeps it selectable for them. */
    heldByMe?: boolean;
}

export interface SlotHold {
    id: Id;
    clinicId: Id;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    heldBy: Id;
    expiresAt: IsoDateTime;
}

export type NotificationKind =
    'confirmation' | 'reminder' | 'reschedule' | 'cancellation';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface NotificationLogEntry {
    id: Id;
    clinicId: Id;
    appointmentId: Id;
    patientId: Id;
    kind: NotificationKind;
    channel: Channel;
    status: NotificationStatus;
    createdAt: IsoDateTime;
    sentAt: IsoDateTime | null;
}

export interface NotificationTemplate {
    id: Id;
    clinicId: Id;
    kind: NotificationKind;
    channel: Channel;
    locale: Locale;
    body: string; // supports {patient_name}, {doctor}, {time}
}

export interface AuditEntry {
    id: Id;
    clinicId: Id;
    actorId: Id;
    action: string; // e.g. appointment.created
    subjectType:
        | 'appointment'
        | 'patient'
        | 'doctor'
        | 'service'
        | 'settings'
        | 'user'
        | 'notification';
    subjectId: Id;
    at: IsoDateTime;
    meta: Record<string, string | number | boolean | null>;
}

/** A signed patient link resolves to one appointment, or to an expired/invalid state. */
export type PatientLinkResult =
    | {
          state: 'valid';
          appointment: Appointment;
          clinic: Clinic;
          doctor: Doctor;
          service: Service;
      }
    | { state: 'expired' };

// ---- Queries and inputs ----

export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    perPage: number;
}

export interface PageQuery {
    page?: number;
    perPage?: number;
}

export interface AppointmentQuery extends PageQuery {
    from?: IsoDate;
    to?: IsoDate;
    doctorId?: Id;
    status?: AppointmentStatus;
    patient?: string; // name or phone fragment
    sort?: 'startsAt' | '-startsAt';
}

export interface SlotQuery {
    doctorId: Id;
    serviceId: Id;
    date: IsoDate;
}

export interface NewPatientInput {
    name: string;
    phone: string;
    preferredLocale?: Locale;
    preferredChannel?: Channel;
    consent?: boolean;
    notes?: string;
}

export interface NewAppointmentInput {
    patientId: Id;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    source: BookingSource;
    reason?: string;
    notes?: string;
}

export type DataErrorCode =
    'NOT_FOUND' | 'SLOT_UNAVAILABLE' | 'INVALID_TRANSITION' | 'VALIDATION';

export class DataError extends Error {
    readonly code: DataErrorCode;
    /** For SLOT_UNAVAILABLE: the nearest free slots, so the UI can offer alternatives. */
    readonly alternatives: Slot[];

    constructor(
        code: DataErrorCode,
        message: string,
        alternatives: Slot[] = [],
    ) {
        super(message);
        this.name = 'DataError';
        this.code = code;
        this.alternatives = alternatives;
    }
}
