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
    /** Patients may cancel or move from their link until this long before; null means no limit. */
    cancellationWindowHours: number | null;
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
    /** Set when the invitation is a doctor's sign-in access (the doctor it links to). */
    doctorId?: Id | null;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    sentAt: IsoDateTime;
    expiresAt: IsoDateTime;
}

export interface Service {
    id: Id;
    clinicId: Id;
    name: string;
    durationMin: number;
    bufferMin: number;
    active: boolean;
}

/** Languages a doctor speaks: data about the doctor, not the screen language (`Locale`). */
export type DoctorLanguage = 'en' | 'ur' | 'pa' | 'ps';

export interface Doctor {
    id: Id;
    clinicId: Id;
    userId: Id | null;
    name: string;
    specialty: string;
    languages: DoctorLanguage[];
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

/** A 30-minute time that is closed every week on that weekday (the doctor blocked it). */
export interface BlockedSlot {
    weekday: number;
    time: TimeOfDay;
}

export interface DoctorAvailability {
    doctorId: Id;
    windows: WorkingWindow[];
    timeOff: TimeOff[];
    blocked: BlockedSlot[];
}

/** One weekday as the doctor edits it. A lunch break is the fixed 13:00 to 14:00 gap. */
export interface DayHours {
    weekday: number;
    on: boolean;
    start: TimeOfDay;
    end: TimeOfDay;
    lunch: boolean;
}

export interface TimeOffDraft {
    id: Id | null;
    startDate: IsoDate;
    endDate: IsoDate;
    reason: string;
}

/** Everything the availability page edits and saves together (`PUT /doctor/availability`). */
export interface AvailabilityDraft {
    /** Monday first. */
    days: DayHours[];
    timeOff: TimeOffDraft[];
    blocked: BlockedSlot[];
}

export interface AffectedBooking {
    appointmentId: Id;
    patientName: string;
    startsAt: IsoDateTime;
}

/** What a draft would produce: bookable 30-minute slots per day, and the bookings it would strand. */
export interface AvailabilityPreview {
    /** Same order as `AvailabilityDraft.days`. */
    slotsPerWeekday: number[];
    total: number;
    affected: AffectedBooking[];
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

/** A patient asked, through their link, to move an appointment (phase 2). */
export interface RescheduleRequest {
    id: Id;
    clinicId: Id;
    appointmentId: Id;
    patientId: Id;
    doctorId: Id;
    /** When the appointment was, at the moment the patient asked. */
    fromStartsAt: IsoDateTime;
    proposedStartsAt: IsoDateTime;
    status: RequestStatus;
    /** The doctor's optional message to reception. */
    message: string | null;
    createdAt: IsoDateTime;
    decidedAt: IsoDateTime | null;
}

export interface RequestDecisionInput {
    decision: 'approved' | 'rejected';
    message?: string;
}

export interface Patient {
    id: Id;
    clinicId: Id;
    name: string;
    phone: string; // E.164, e.g. +923001234567; '' for a walk-in added without a number
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
    /** The staff member who booked it, or 'patient' when it came from a signed link. */
    createdBy: Id;
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
export type FailureReason = 'not_on_whatsapp' | 'unreachable' | 'no_consent';

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
    /** Why a failed message failed. */
    failureReason?: FailureReason;
    /** Set on a failed row once it has been sent again; the log itself is append-only. */
    resentAt?: IsoDateTime;
}

/** What a patient chose on their signed link. */
export interface PatientReply {
    id: Id;
    clinicId: Id;
    appointmentId: Id;
    patientId: Id;
    at: IsoDateTime;
    action: 'confirm' | 'reschedule' | 'cancel';
}

/** One line in the appointment's "Reminders and patient replies" timeline. */
export type TimelineItem =
    | { type: 'message'; id: Id; at: IsoDateTime; entry: NotificationLogEntry }
    | { type: 'reply'; id: Id; at: IsoDateTime; reply: PatientReply };

/** The placeholders a message may use; the server replaces them for each patient. */
export const TEMPLATE_VARIABLES = [
    'patient_name',
    'doctor',
    'time',
    'clinic_name',
    'link',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** A message the clinic has edited; messages it has not edited use the built-in default. */
export interface NotificationTemplate {
    id: Id;
    clinicId: Id;
    kind: NotificationKind;
    channel: Channel;
    locale: Locale;
    body: string; // supports the TEMPLATE_VARIABLES
}

export interface TemplateKey {
    kind: NotificationKind;
    channel: Channel;
    locale: Locale;
}

// ---- Clinic admin: what the admin pages send ----

export interface DoctorProfileDraft {
    name: string;
    specialty: string;
    languages: DoctorLanguage[];
    serviceIds: Id[];
    active: boolean;
}

/** `POST /admin/doctors` and `PUT /admin/doctors/{id}`: profile, services and weekly availability together. */
export interface DoctorSaveInput {
    profile: DoctorProfileDraft;
    availability: AvailabilityDraft;
}

export interface StaffInviteInput {
    email: string;
    role: 'receptionist' | 'clinic_admin';
}

export interface ServiceInput {
    name: string;
    durationMin: number;
    bufferMin: number;
    /** Doctors who offer it. */
    doctorIds: Id[];
}

/** `PUT /admin/settings`: the clinic's details and everything in `ClinicSettings`, saved together. */
export interface SettingsDraft {
    clinic: Pick<
        Clinic,
        'name' | 'phone' | 'address' | 'timezone' | 'defaultLocale'
    >;
    settings: Omit<ClinicSettings, 'clinicId'>;
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
        | 'template'
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
    patientId?: Id;
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
    /** Walk-ins may be added with a name only; the profile then says messages cannot be sent. */
    noPhone?: boolean;
    preferredLocale?: Locale;
    preferredChannel?: Channel;
    consent?: boolean;
    notes?: string;
}

export type PatientPatch = Partial<
    Pick<
        Patient,
        | 'name'
        | 'phone'
        | 'preferredLocale'
        | 'preferredChannel'
        | 'consent'
        | 'notes'
    >
>;

export interface NewAppointmentInput {
    patientId: Id;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    source: BookingSource;
    reason?: string;
    notes?: string;
}

/**
 * Errors the pages understand. The real adapter builds them from the response: 404 NOT_FOUND,
 * 409 SLOT_UNAVAILABLE (with alternatives), 422 (VALIDATION, INVALID_PHONE, DUPLICATE_PHONE,
 * INVALID_TRANSITION, carrying the field), 403 FORBIDDEN. Pages never read `message`.
 */
export type DataErrorCode =
    | 'NOT_FOUND'
    | 'SLOT_UNAVAILABLE'
    | 'INVALID_TRANSITION'
    | 'VALIDATION'
    | 'INVALID_PHONE'
    | 'DUPLICATE_PHONE'
    | 'DUPLICATE_EMAIL'
    | 'DUPLICATE_NAME'
    | 'LAST_ADMIN'
    | 'UNKNOWN_VARIABLE'
    | 'FORBIDDEN';

export class DataError extends Error {
    readonly code: DataErrorCode;
    /** For SLOT_UNAVAILABLE: the nearest free slots, so the UI can offer alternatives. */
    readonly alternatives: Slot[];
    /** The form field the error belongs to, when it belongs to one. */
    readonly field: string | null;
    /** A value the message needs, such as the unknown template variable. */
    readonly detail: string | null;

    constructor(
        code: DataErrorCode,
        message: string,
        alternatives: Slot[] = [],
        field: string | null = null,
        detail: string | null = null,
    ) {
        super(message);
        this.name = 'DataError';
        this.code = code;
        this.alternatives = alternatives;
        this.field = field;
        this.detail = detail;
    }
}
