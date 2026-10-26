import type {
    Appointment,
    AppointmentStatus,
    AuditEntry,
    AvailabilityDraft,
    AvailabilityPreview,
    Clinic,
    ClinicSettings,
    Doctor,
    DoctorAvailability,
    DoctorProfileDraft,
    Id,
    IsoDate,
    IsoDateTime,
    NotificationKind,
    NotificationLogEntry,
    Channel,
    Locale,
    Page,
    Patient,
    RescheduleRequest,
    Service,
    Slot,
    TimelineItem,
} from './types';

/**
 * Read models: everything one page draws, already joined and ready. These are what the Laravel
 * controllers will hand to the Inertia pages as props (or return from a JSON endpoint), so the
 * pages never assemble data themselves. The mock builds them in `mock-views.ts`; the real adapter
 * only has to return the same shapes.
 *
 * Mutations stay on `DataSource` (they mirror the backend routes one to one).
 */

/** Who did something: a staff member, the patient (signed link) or the system. */
export interface Actor {
    kind: 'user' | 'patient' | 'system';
    /** Set for staff only. */
    name: string | null;
}

/** What the server will let the current user do with an appointment. The client never re-derives it. */
export interface AppointmentAllowed {
    /** Statuses the appointment may be moved to. */
    transitions: AppointmentStatus[];
    canUndo: boolean;
    canReschedule: boolean;
    canCancel: boolean;
}

/** An appointment with its people and service embedded. */
export interface AppointmentRow {
    appointment: Appointment;
    patient: Patient;
    doctor: Doctor;
    service: Service;
    createdBy: Actor;
    allowed: AppointmentAllowed;
}

// ---- Receptionist ----

export interface DoctorDay {
    doctor: Doctor;
    rows: AppointmentRow[];
    nextFree: Slot | null;
    /** No working hours today (day off, time off or a holiday). */
    notWorking: boolean;
}

export interface TodayView {
    clinic: Clinic;
    today: IsoDate;
    services: Service[];
    days: DoctorDay[];
}

export type AppointmentsWhen = 'any' | 'today' | 'next7' | 'past7';

export interface AppointmentsParams {
    when: AppointmentsWhen;
    doctorId?: Id;
    status?: AppointmentStatus;
    /** Patient name or phone fragment. */
    q?: string;
    sort: 'asc' | 'desc';
    page: number;
    perPage?: number;
}

export interface AppointmentsView {
    clinic: Clinic;
    /** Clinic-local today, so relative labels (Tomorrow, 3 days ago) agree with the server. */
    today: IsoDate;
    doctors: Doctor[];
    page: Page<AppointmentRow>;
}

export interface HistoryItem {
    id: Id;
    action: AuditEntry['action'];
    meta: AuditEntry['meta'];
    at: IsoDateTime;
    actor: Actor;
}

export interface AppointmentDetailView {
    clinic: Clinic;
    today: IsoDate;
    row: AppointmentRow;
    timeline: TimelineItem[];
    history: HistoryItem[];
}

export type CalendarMode = 'day' | 'week' | 'month';

export interface CalendarParams {
    view: CalendarMode;
    /** Clinic-local date; null means today (the server decides). */
    date: IsoDate | null;
    doctorId: Id | 'all';
}

export interface CalendarColumn {
    doctor: Doctor;
    service: Service | undefined;
    slots: Slot[];
    availability: DoctorAvailability;
    /** Time off or a clinic holiday on this date. */
    offToday: boolean;
}

export interface CalendarViewData {
    clinic: Clinic;
    settings: ClinicSettings;
    today: IsoDate;
    /** The date the view is anchored on (resolved when the request left it empty). */
    date: IsoDate;
    allDoctors: Doctor[];
    /** The doctors shown (all, or the one chosen). */
    doctors: Doctor[];
    rows: AppointmentRow[];
    /** Day view only. */
    columns: CalendarColumn[];
    nowIso: IsoDateTime;
}

export interface PatientRow {
    patient: Patient;
    lastVisit: IsoDateTime | null;
    next: IsoDateTime | null;
}

export interface PatientsView {
    clinic: Clinic;
    today: IsoDate;
    rows: PatientRow[];
}

export interface PatientDetailView {
    clinic: Clinic;
    today: IsoDate;
    patient: Patient;
    appointments: AppointmentRow[];
}

export interface NotificationRow {
    entry: NotificationLogEntry;
    patient: Patient | undefined;
}

export interface NotificationsView {
    clinic: Clinic;
    today: IsoDate;
    rows: NotificationRow[];
}

// ---- Doctor ----

export interface DoctorOverviewView {
    clinic: Clinic;
    today: IsoDate;
    doctor: Doctor;
    /** The doctor's own appointments today, in time order. */
    rows: AppointmentRow[];
    /** Days in the next 30 with at least one appointment that is not cancelled. */
    daysAhead: number;
    pendingRequests: number;
}

export interface DoctorScheduleParams {
    view: 'day' | 'week';
    date: IsoDate | null;
}

export interface AvailabilityView {
    clinic: Clinic;
    today: IsoDate;
    doctor: Doctor;
    draft: AvailabilityDraft;
    /** The preview of the saved availability; the page asks for a new one as the draft changes. */
    preview: AvailabilityPreview;
}

/** `doctorId` is for the clinic admin; a doctor always gets their own. */
export interface AvailabilityParams {
    doctorId?: Id;
}

export interface RequestRow {
    request: RescheduleRequest;
    row: AppointmentRow;
}

export interface RequestsView {
    clinic: Clinic;
    today: IsoDate;
    doctor: Doctor;
    pending: RequestRow[];
    history: RequestRow[];
}

/** Shared props for every doctor page (the sidebar badge). */
export interface DoctorShellView {
    pendingRequests: number;
}

// ---- Clinic admin ----

export type AdminPeriod = 'last7' | 'month' | 'last3months';

/** A number for this period and the same number for the period before it. */
export interface KpiValue {
    value: number;
    previous: number;
}

export interface TrendPoint {
    /** The day, or the Monday of the week when the trend is weekly. */
    date: IsoDate;
    current: number;
    previous: number;
}

export interface AdminOverviewView {
    clinic: Clinic;
    today: IsoDate;
    period: {
        id: AdminPeriod;
        from: IsoDate;
        to: IsoDate;
        previousFrom: IsoDate;
        previousTo: IsoDate;
    };
    /** Counts are whole numbers; the rates and utilisation are percentages with one decimal. */
    kpis: {
        booked: KpiValue;
        done: KpiValue;
        cancellationRate: KpiValue;
        noShowRate: KpiValue;
        newPatients: KpiValue;
        reminderDelivery: KpiValue;
        confirmed: KpiValue;
        doctorTimeUsed: KpiValue;
    };
    trend: { granularity: 'day' | 'week'; points: TrendPoint[] };
    /** Appointments per weekday, Monday first. */
    weekdays: number[];
    outcomes: {
        done: number;
        upcoming: number;
        cancelled: number;
        noShow: number;
    };
    sources: { voice: number; manual: number };
    doctorUse: {
        doctorId: Id;
        name: string;
        /** 0 to 1. */
        utilisation: number;
        booked: number;
    }[];
    services: {
        serviceId: Id;
        name: string;
        /** 0 to 1. */
        share: number;
        booked: number;
    }[];
    todayDoctors: {
        doctor: Doctor;
        booked: number;
        arrived: number;
        inConsultation: number;
        done: number;
        nextFree: Slot | null;
    }[];
    alerts: {
        /** Messages whose last attempt failed and that nobody has sent again. */
        failedMessages: number;
        doctorsWithoutHours: { id: Id; name: string }[];
    };
}

export interface AdminDoctorsParams {
    q?: string;
    status: 'all' | 'active' | 'inactive';
}

export interface AdminDoctorRow {
    doctor: Doctor;
    nextFree: Slot | null;
    upcoming: number;
}

export interface AdminDoctorsView {
    clinic: Clinic;
    today: IsoDate;
    /** All doctors, before the search and status filter (for "Showing 3 of 4"). */
    total: number;
    rows: AdminDoctorRow[];
}

export interface DoctorSignIn {
    state: 'none' | 'invited' | 'expired' | 'active';
    /** The invited or signed-in email. */
    email: string | null;
    invitationId: Id | null;
}

export interface AdminDoctorView {
    clinic: Clinic;
    today: IsoDate;
    /** `null` id means a doctor who has not been created yet. */
    id: Id | null;
    profile: DoctorProfileDraft;
    /** Every service, so the doctor's offer can be ticked. */
    services: Service[];
    upcoming: number;
    signIn: DoctorSignIn;
    draft: AvailabilityDraft;
    preview: AvailabilityPreview;
}

export type StaffRole = 'receptionist' | 'clinic_admin';
export type StaffStatus = 'active' | 'invited' | 'expired' | 'deactivated';

export interface StaffRow {
    /** A user id, or an invitation id when `status` is invited or expired. */
    id: Id;
    name: string | null;
    email: string;
    role: StaffRole;
    status: StaffStatus;
    isYou: boolean;
    /** The server decides, including "not yourself" and "not the last admin". */
    allowed: {
        resend: boolean;
        revoke: boolean;
        deactivate: boolean;
        reactivate: boolean;
    };
}

export interface AdminStaffView {
    clinic: Clinic;
    rows: StaffRow[];
}

export interface ServiceRow {
    service: Service;
    doctorIds: Id[];
}

export interface AdminServicesView {
    clinic: Clinic;
    services: ServiceRow[];
    doctors: Doctor[];
}

export interface AdminSettingsView {
    clinic: Clinic;
    settings: ClinicSettings;
}

export interface AdminTemplate {
    kind: NotificationKind;
    channel: Channel;
    locale: Locale;
    body: string;
    /** What "Reset to default" restores. */
    defaultBody: string;
    isCustom: boolean;
}

export interface AdminTemplatesView {
    clinic: Clinic;
    templates: AdminTemplate[];
    /** The placeholders a message may use. */
    variables: string[];
    /** Example values, per message language, for the preview. */
    sample: Record<Locale, Record<string, string>>;
}

export type AuditCategory =
    'booking' | 'edit' | 'cancel' | 'login' | 'settings' | 'invite';

export interface AuditParams {
    /** 1 means today only. */
    days: 1 | 7 | 30;
    userId?: Id;
    category?: AuditCategory;
    page: number;
}

export interface AuditRow {
    id: Id;
    at: IsoDateTime;
    actor: Actor;
    category: AuditCategory;
    action: AuditEntry['action'];
    meta: AuditEntry['meta'];
    /** Joined for appointment entries, so the details can name the patient and doctor. */
    appointment?: {
        patientName: string;
        doctorName: string;
        startsAt: IsoDateTime;
    };
}

export interface AuditView {
    clinic: Clinic;
    today: IsoDate;
    total: number;
    page: number;
    perPage: number;
    rows: AuditRow[];
    users: { id: Id; name: string }[];
}

export interface ViewSource {
    adminOverview(params: { period: AdminPeriod }): Promise<AdminOverviewView>;
    adminDoctors(params: AdminDoctorsParams): Promise<AdminDoctorsView>;
    /** `doctorId: 'new'` is the blank form; `null` when the doctor does not exist. */
    adminDoctor(params: {
        doctorId: Id | 'new';
    }): Promise<AdminDoctorView | null>;
    adminStaff(): Promise<AdminStaffView>;
    adminServices(): Promise<AdminServicesView>;
    adminSettings(): Promise<AdminSettingsView>;
    adminTemplates(): Promise<AdminTemplatesView>;
    adminAudit(params: AuditParams): Promise<AuditView>;
    doctorOverview(): Promise<DoctorOverviewView>;
    /** The doctor's own appointments, shaped like the reception calendar so one calendar serves both. */
    doctorSchedule(params: DoctorScheduleParams): Promise<CalendarViewData>;
    availability(params?: AvailabilityParams): Promise<AvailabilityView>;
    requests(): Promise<RequestsView>;
    doctorShell(): Promise<DoctorShellView>;
    today(): Promise<TodayView>;
    appointments(params: AppointmentsParams): Promise<AppointmentsView>;
    /** `null` when the appointment does not exist. */
    appointment(id: Id): Promise<AppointmentDetailView | null>;
    calendar(params: CalendarParams): Promise<CalendarViewData>;
    patients(params: { q: string }): Promise<PatientsView>;
    /** `null` when the patient does not exist. */
    patient(id: Id): Promise<PatientDetailView | null>;
    notifications(): Promise<NotificationsView>;
}

/** The first active service a doctor offers: what a walk-in or a calendar click is booked under. */
export function defaultService(
    doctor: Doctor,
    services: Service[],
): Service | undefined {
    return services.find((s) => s.active && doctor.serviceIds.includes(s.id));
}
