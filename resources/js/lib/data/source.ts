import type {
    Appointment,
    AppointmentQuery,
    AvailabilityDraft,
    AvailabilityPreview,
    AppointmentStatus,
    AuditEntry,
    Clinic,
    ClinicSettings,
    Doctor,
    DoctorAvailability,
    DoctorSaveInput,
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
    RequestDecisionInput,
    RescheduleRequest,
    PatientPatch,
    Service,
    ServiceInput,
    SettingsDraft,
    StaffInviteInput,
    TemplateKey,
    Slot,
    SlotHold,
    SlotQuery,
    TimelineItem,
    User,
} from './types';
import type { PatientActions, PatientViewSource } from './patient-views';
import type { ViewSource } from './views';

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

    /** One read model per page (see ./views). */
    views: ViewSource;

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
        /** The doctor linked to the signed-in user. Rejects with NOT_FOUND for other roles. */
        me(): Promise<Doctor>;
        /**
         * `PUT /doctor/availability` (and `PUT /admin/doctors/{id}/availability` for the admin):
         * replaces weekly hours, time off and blocked times together. A doctor always saves their own.
         */
        saveAvailability(
            draft: AvailabilityDraft,
            doctorId?: Id,
        ): Promise<void>;
        /**
         * What a draft would produce, computed with the server's slot rules (nothing is saved).
         * The admin passes the doctor, or `'new'` for one that does not exist yet.
         */
        previewAvailability(
            draft: AvailabilityDraft,
            doctorId?: Id | 'new',
        ): Promise<AvailabilityPreview>;
        /** `POST /admin/doctors`. */
        create(input: DoctorSaveInput): Promise<Doctor>;
        /** `PUT /admin/doctors/{id}`: profile, services and availability in one request. */
        save(id: Id, input: DoctorSaveInput): Promise<Doctor>;
        /** `PATCH /admin/doctors/{id}`: hides or shows the doctor in booking; appointments stay. */
        setActive(id: Id, active: boolean): Promise<Doctor>;
        /** `POST /admin/doctors/{id}/invite`: sign-in access for this doctor. */
        invite(id: Id, email: string): Promise<Invitation>;
    };

    staff: {
        /** `POST /admin/staff/invite`. */
        invite(input: StaffInviteInput): Promise<Invitation>;
        /** `POST /admin/staff/{id}/resend`; the id is an invitation's. */
        resend(invitationId: Id): Promise<Invitation>;
        /** `DELETE /admin/staff/{id}/invite`. */
        revoke(invitationId: Id): Promise<void>;
        /** `PATCH /admin/staff/{id}/deactivate`; refused for yourself and for the last admin. */
        setActive(userId: Id, active: boolean): Promise<User>;
    };

    settings: {
        /** `PUT /admin/settings`. */
        save(draft: SettingsDraft): Promise<void>;
    };

    templates: {
        /** `PUT /admin/templates`: saves the clinic's own wording for one message. */
        save(key: TemplateKey, body: string): Promise<void>;
        /** `DELETE /admin/templates`: back to the built-in wording. */
        reset(key: TemplateKey): Promise<void>;
        /** `POST /admin/templates/test`: sends the text, filled with sample details, to one phone. */
        testSend(
            key: TemplateKey,
            body: string,
            phone: string,
        ): Promise<{ sentTo: string }>;
    };

    requests: {
        /** Approving moves the appointment (409 with alternatives if the time is gone). */
        decide(id: Id, input: RequestDecisionInput): Promise<RescheduleRequest>;
    };

    services: {
        list(options?: { activeOnly?: boolean }): Promise<Service[]>;
        /** `POST /admin/services`. */
        create(input: ServiceInput): Promise<Service>;
        /** `PUT /admin/services/{id}`. */
        update(id: Id, input: ServiceInput): Promise<Service>;
        /** `PATCH /admin/services/{id}`: off hides it from booking; appointments are kept. */
        setActive(id: Id, active: boolean): Promise<Service>;
    };

    patients: {
        /** Phone matches first, then name matches. */
        search(query: string, limit?: number): Promise<Patient[]>;
        recent(limit?: number): Promise<Patient[]>;
        get(id: Id): Promise<Patient>;
        create(input: NewPatientInput): Promise<Patient>;
        /** Validates the phone number and rejects one that belongs to another patient. */
        update(id: Id, patch: PatientPatch): Promise<Patient>;
    };

    appointments: {
        list(query?: AppointmentQuery): Promise<Page<Appointment>>;
        get(id: Id): Promise<Appointment>;
        /** Rejects with DataError('SLOT_UNAVAILABLE') carrying the nearest alternatives. */
        create(input: NewAppointmentInput): Promise<Appointment>;
        reschedule(id: Id, startsAt: IsoDateTime): Promise<Appointment>;
        cancel(id: Id): Promise<Appointment>;
        setStatus(id: Id, status: AppointmentStatus): Promise<Appointment>;
        /**
         * Steps a same-day status back one stage (the "press again to undo" on Today).
         * Rejects with INVALID_TRANSITION for other days or statuses with nothing to undo.
         */
        undoStatus(id: Id): Promise<Appointment>;
        /** Messages sent for this appointment and what the patient replied, newest first. */
        timeline(id: Id): Promise<TimelineItem[]>;
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
        /** Every hold on a clinic-local date, for striping held cells on the calendar. */
        holds(date: IsoDate): Promise<SlotHold[]>;
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
            subjectId?: Id;
            action?: string;
            from?: IsoDate;
            to?: IsoDate;
        }): Promise<AuditEntry[]>;
    };
}

/**
 * Patients act through signed links, not accounts, so this is not tied to a clinic session and is
 * kept apart from `DataSource`: a patient page can only reach what its own token opens.
 */
export interface PatientLinkSource extends PatientActions {
    /** One read model per patient page. */
    views: PatientViewSource;
    resolve(token: string): Promise<PatientLinkResult>;
}
