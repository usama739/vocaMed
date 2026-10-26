import type { AppointmentRow } from '@/lib/data';

/**
 * Who the doctor sees next: the one already in consultation, else the first who has arrived,
 * else the first still booked or confirmed. Rows are in time order.
 */
export function nextPatient(
    rows: AppointmentRow[],
): AppointmentRow | undefined {
    const by = (...statuses: string[]) =>
        rows.find((r) => statuses.includes(r.appointment.status));

    return by('in_consultation') ?? by('arrived') ?? by('confirmed', 'booked');
}
