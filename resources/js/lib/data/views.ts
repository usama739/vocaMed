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
    Id,
    IsoDate,
    IsoDateTime,
    NotificationLogEntry,
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

export interface ViewSource {
    doctorOverview(): Promise<DoctorOverviewView>;
    /** The doctor's own appointments, shaped like the reception calendar so one calendar serves both. */
    doctorSchedule(params: DoctorScheduleParams): Promise<CalendarViewData>;
    availability(): Promise<AvailabilityView>;
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
