import type {
    Appointment,
    AppointmentQuery,
    AppointmentStatus,
    AuditEntry,
    Clinic,
    ClinicSettings,
    Doctor,
    DoctorAvailability,
    Id,
    Invitation,
    IsoDate,
    IsoDateTime,
    NewAppointmentInput,
    NewPatientInput,
    NotificationLogEntry,
    NotificationStatus,
    NotificationTemplate,
    Page,
    Patient,
    PatientLinkResult,
    Service,
    Slot,
    SlotHold,
    SlotQuery,
    User,
} from './types';

/**
 * The only surface the UI is allowed to use for data.
 *
 * Today it is backed by in-memory mocks (see ./mock). When the Laravel API is
 * ready, write an `ApiDataSource` that implements this interface (Inertia
 * props or fetch) and change the one line in ./index.ts. Pages and components
 * must not import from ./mock or ./seed.
 *
 * A DataSource is bound to one clinic (tenant) and one acting user, matching
 * how the server scopes every request. Every method is async so callers
 * already handle loading and error states.
 */
export interface DataSource {
    readonly clinicId: Id;

    clinic: {
        get(): Promise<Clinic>;
        settings(): Promise<ClinicSettings>;
    };

    users: {
        list(): Promise<User[]>;
        invitations(): Promise<Invitation[]>;
    };

    doctors: {
        list(options?: { activeOnly?: boolean }): Promise<Doctor[]>;
        get(id: Id): Promise<Doctor>;
        availability(id: Id): Promise<DoctorAvailability>;
        nextFreeSlot(doctorId: Id, serviceId: Id): Promise<Slot | null>;
    };

    services: {
        list(options?: { activeOnly?: boolean }): Promise<Service[]>;
    };

    patients: {
        /** Phone matches first, then name matches. */
        search(query: string, limit?: number): Promise<Patient[]>;
        recent(limit?: number): Promise<Patient[]>;
        get(id: Id): Promise<Patient>;
        create(input: NewPatientInput): Promise<Patient>;
    };

    appointments: {
        list(query?: AppointmentQuery): Promise<Page<Appointment>>;
        get(id: Id): Promise<Appointment>;
        /** Rejects with DataError('SLOT_UNAVAILABLE') carrying the nearest alternatives. */
        create(input: NewAppointmentInput): Promise<Appointment>;
        reschedule(id: Id, startsAt: IsoDateTime): Promise<Appointment>;
        cancel(id: Id): Promise<Appointment>;
        setStatus(id: Id, status: AppointmentStatus): Promise<Appointment>;
    };

    slots: {
        list(query: SlotQuery): Promise<Slot[]>;
        /** Starts the 2-minute hold; a user holds one slot at a time. */
        hold(input: {
            doctorId: Id;
            serviceId: Id;
            startsAt: IsoDateTime;
        }): Promise<SlotHold>;
        release(holdId: Id): Promise<void>;
        /** The nearest free slots to `startsAt`, same doctor and service. */
        alternatives(
            input: { doctorId: Id; serviceId: Id; startsAt: IsoDateTime },
            count?: number,
        ): Promise<Slot[]>;
    };

    notifications: {
        list(filter?: {
            status?: NotificationStatus;
        }): Promise<NotificationLogEntry[]>;
        resend(id: Id): Promise<NotificationLogEntry>;
        templates(): Promise<NotificationTemplate[]>;
    };

    audit: {
        list(filter?: {
            actorId?: Id;
            action?: string;
            from?: IsoDate;
            to?: IsoDate;
        }): Promise<AuditEntry[]>;
    };
}

/** Patients act through signed links, not accounts, so this is not tied to a clinic session. */
export interface PatientLinkSource {
    resolve(token: string): Promise<PatientLinkResult>;
}
