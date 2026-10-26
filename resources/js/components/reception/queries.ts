import { localDate, todayIn } from '@/components/reception/format';
import { clockNow } from '@/lib/clock';
import {
    utcToZoned,
    type Appointment,
    type AppointmentQuery,
    type Clinic,
    type DataSource,
    type Doctor,
    type IsoDate,
    type Page,
    type Patient,
    type Service,
    type Slot,
} from '@/lib/data';

/** An appointment with the people and service it points at, ready to draw. */
export type Row = {
    appointment: Appointment;
    patient: Patient;
    doctor: Doctor;
    service: Service;
};

/** Joins appointments to their patient, doctor and service (the real API will embed these). */
export async function toRows(
    source: DataSource,
    appointments: Appointment[],
): Promise<Row[]> {
    const ids = [...new Set(appointments.map((a) => a.patientId))];
    const [doctors, services, patients] = await Promise.all([
        source.doctors.list(),
        source.services.list(),
        Promise.all(ids.map((id) => source.patients.get(id))),
    ]);

    return appointments.flatMap((appointment) => {
        const patient = patients.find((p) => p.id === appointment.patientId);
        const doctor = doctors.find((d) => d.id === appointment.doctorId);
        const service = services.find((s) => s.id === appointment.serviceId);

        return patient && doctor && service
            ? [{ appointment, patient, doctor, service }]
            : [];
    });
}

export async function loadRows(
    source: DataSource,
    query: AppointmentQuery,
): Promise<Page<Row>> {
    const page = await source.appointments.list(query);

    return { ...page, items: await toRows(source, page.items) };
}

/** The service a walk-in is booked under: the first active one the doctor offers. */
export function defaultService(
    doctor: Doctor,
    services: Service[],
): Service | undefined {
    return services.find((s) => s.active && doctor.serviceIds.includes(s.id));
}

export type DoctorDay = {
    doctor: Doctor;
    rows: Row[];
    nextFree: Slot | null;
    /** No working hours today (day off, time off or a holiday). */
    notWorking: boolean;
};

export type TodayData = {
    clinic: Clinic;
    today: IsoDate;
    services: Service[];
    days: DoctorDay[];
};

export async function loadToday(source: DataSource): Promise<TodayData> {
    const clinic = await source.clinic.get();
    const today = todayIn(clinic.timezone);
    const [doctors, services, settings, page] = await Promise.all([
        source.doctors.list({ activeOnly: true }),
        source.services.list(),
        source.clinic.settings(),
        source.appointments.list({ from: today, to: today, perPage: 500 }),
    ]);
    const rows = await toRows(source, page.items);
    const weekday = utcToZoned(clockNow(), clinic.timezone).weekday;
    const holiday = settings.holidays.some((h) => h.date === today);

    const days = await Promise.all(
        doctors.map(async (doctor): Promise<DoctorDay> => {
            const service = defaultService(doctor, services);
            const [availability, nextFree] = await Promise.all([
                source.doctors.availability(doctor.id),
                service
                    ? source.doctors.nextFreeSlot(doctor.id, service.id)
                    : Promise.resolve(null),
            ]);
            const off = availability.timeOff.some(
                (t) => t.startDate <= today && today <= t.endDate,
            );

            return {
                doctor,
                nextFree,
                notWorking:
                    holiday ||
                    off ||
                    !availability.windows.some((w) => w.weekday === weekday),
                rows: rows
                    .filter((r) => r.appointment.doctorId === doctor.id)
                    .sort((a, b) =>
                        a.appointment.startsAt.localeCompare(
                            b.appointment.startsAt,
                        ),
                    ),
            };
        }),
    );

    return { clinic, today, services, days };
}

/** True when an instant falls on the given clinic-local date. */
export const isOn = (iso: string, date: IsoDate, timeZone: string) =>
    localDate(iso, timeZone) === date;

const VISITED = new Set(['done', 'in_consultation', 'arrived']);
const UPCOMING = new Set(['booked', 'confirmed']);

/** When a patient was last seen and when they are next booked. */
export function summariseVisits(
    appointments: Appointment[],
    now: Date = clockNow(),
): { lastVisit: string | null; next: string | null } {
    const t = now.getTime();
    const visits = appointments
        .filter(
            (a) => VISITED.has(a.status) && new Date(a.startsAt).getTime() <= t,
        )
        .map((a) => a.startsAt)
        .sort();
    const upcoming = appointments
        .filter(
            (a) =>
                UPCOMING.has(a.status) && new Date(a.startsAt).getTime() >= t,
        )
        .map((a) => a.startsAt)
        .sort();

    return {
        lastVisit: visits.at(-1) ?? null,
        next: upcoming[0] ?? null,
    };
}

export type PatientRow = {
    patient: Patient;
    lastVisit: string | null;
    next: string | null;
};

/** Recent patients, or search results (phone first, then name), with last and next visit. */
export async function loadPatientRows(
    source: DataSource,
    search: string,
): Promise<PatientRow[]> {
    const patients = search
        ? await source.patients.search(search, 25)
        : await source.patients.recent(8);
    const pages = await Promise.all(
        patients.map((p) =>
            source.appointments.list({ patientId: p.id, perPage: 200 }),
        ),
    );

    return patients.map((patient, index) => ({
        patient,
        ...summariseVisits(pages[index].items),
    }));
}
