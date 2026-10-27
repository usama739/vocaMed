import type { AppointmentStatus, IsoDate, IsoDateTime, Locale } from './types';

/**
 * What the patient pages draw. A signed link opens exactly one appointment, so these read models
 * carry only that appointment's details: the patient's first name, never their full name or phone,
 * and nothing about any other patient. They are what the Laravel controllers will hand to the
 * Inertia pages as props; the mock builds them in `mock-patient-links.ts`.
 */

export interface LinkClinic {
    name: string;
    phone: string;
    address: string;
    timezone: string;
}

/** A link that no longer works, or never did. The clinic is only named when the server knows it. */
export interface ExpiredLinkView {
    state: 'expired';
    clinic: { name: string; phone: string } | null;
}

export interface LinkAppointment {
    /** The first word of the patient's name, as entered. */
    firstName: string;
    doctorName: string;
    serviceName: string;
    durationMin: number;
    startsAt: IsoDateTime;
    status: AppointmentStatus;
}

interface ValidLinkBase {
    state: 'valid';
    clinic: LinkClinic;
    today: IsoDate;
    appointment: LinkAppointment;
    /** The language the patient asked for on their record; the server opens the page in it. */
    preferredLocale: Locale;
}

/** What the server will let the patient do. The page never works this out itself. */
export interface LinkAllowed {
    confirm: boolean;
    reschedule: boolean;
    cancel: boolean;
}

export interface ManageView extends ValidLinkBase {
    allowed: LinkAllowed;
    /**
     * Inside the cancellation window (or after the start): changing online is refused. `deadline` is
     * when it closed.
     */
    late: { deadline: IsoDateTime } | null;
    /** Hours before the visit that changing is free; `null` means no limit. */
    cancellationWindowHours: number | null;
    /** A reschedule request is waiting for the doctor. */
    pendingRequest: boolean;
    /** It is the day of the visit, so the queue page has something to show. */
    queueOpen: boolean;
}

export interface RescheduleDay {
    date: IsoDate;
    /** The doctor does not work that day. */
    closed: boolean;
    /** Free times, as instants, in order. */
    slots: IsoDateTime[];
}

export interface RescheduleView extends ValidLinkBase {
    allowed: LinkAllowed;
    late: { deadline: IsoDateTime } | null;
    pendingRequest: boolean;
    /** The clinic approves time changes: a choice becomes a request, not a move. */
    needsApproval: boolean;
    /** Today and the thirteen days after it. */
    days: RescheduleDay[];
}

export type QueueStage =
    'notToday' | 'notYet' | 'waiting' | 'next' | 'consult' | 'done' | 'ended';

export interface StatusView extends ValidLinkBase {
    stage: QueueStage;
    /** Patients checked in ahead of this one, including the one in the consulting room. */
    ahead: number;
    /** Estimated minutes, rounded up to 5; 0 when next. */
    waitMin: number;
    updatedAt: IsoDateTime;
}

export type ManagePage = ManageView | ExpiredLinkView;
export type ReschedulePage = RescheduleView | ExpiredLinkView;
export type StatusPage = StatusView | ExpiredLinkView;

export interface PatientViewSource {
    manage(token: string): Promise<ManagePage>;
    reschedule(token: string): Promise<ReschedulePage>;
    status(token: string): Promise<StatusPage>;
    expired(token: string): Promise<ExpiredLinkView>;
}

export type RescheduleOutcome =
    | { result: 'moved'; startsAt: IsoDateTime }
    | { result: 'requested'; startsAt: IsoDateTime };

/** What a patient can do through the link. Every action answers with the saved state. */
export interface PatientActions {
    /** `POST /p/{token}/confirm`. Repeating it is harmless. */
    confirm(token: string): Promise<{ status: AppointmentStatus }>;
    /** `POST /p/{token}/cancel`. Refused inside the late window. */
    cancel(token: string): Promise<{ status: AppointmentStatus }>;
    /**
     * `POST /p/{token}/reschedule`. Moves at once, or files a request when the clinic requires
     * approval. A time that was just taken answers SLOT_UNAVAILABLE.
     */
    reschedule(
        token: string,
        startsAt: IsoDateTime,
    ): Promise<RescheduleOutcome>;
    /** `POST /p/{token}/request-link`. Always the same answer; rate limited. */
    requestNewLink(token: string): Promise<void>;
}
