import type { MockDatabase } from './seed';

const SENT_AFTER_MS = 6_000;
const DELIVERED_AFTER_MS = 12_000;
const HOLD_MS = 45_000;

/**
 * Stand-in for the live back end while the screens are built: messages queued since the page
 * opened move on to Sent and then Delivered by themselves, and (with `otherReceptionist`)
 * another receptionist now and then holds a free slot, so the live behaviour can be seen.
 * Rows that were already in the log when it started are left alone. Returns a stop function.
 */
export function startActivitySimulator(
    db: MockDatabase,
    options: {
        clinicId: string;
        otherReceptionist?: boolean;
        now?: () => Date;
    },
): () => void {
    const now = options.now ?? (() => new Date());
    const startedAt = now().getTime();

    const advance = window.setInterval(() => {
        const t = now().getTime();

        for (const entry of db.notifications) {
            if (
                entry.clinicId !== options.clinicId ||
                new Date(entry.createdAt).getTime() < startedAt
            ) {
                continue;
            }

            const age = t - new Date(entry.createdAt).getTime();

            if (entry.status === 'queued' && age > SENT_AFTER_MS) {
                entry.status = 'sent';
                entry.sentAt = new Date(t).toISOString();
            } else if (entry.status === 'sent' && age > DELIVERED_AFTER_MS) {
                entry.status = 'delivered';
            }
        }
    }, 2_000);

    let hold = 0;

    if (options.otherReceptionist) {
        hold = window.setInterval(() => {
            const doctor = db.doctors.find(
                (d) => d.clinicId === options.clinicId && d.active,
            );
            const service = db.services.find((s) =>
                doctor?.serviceIds.includes(s.id),
            );

            if (!doctor || !service) {
                return;
            }

            const inFuture = new Date(now().getTime() + 60 * 60_000);
            inFuture.setMinutes(0, 0, 0);
            db.holds.push({
                id: `hold_sim_${inFuture.getTime()}`,
                clinicId: options.clinicId,
                doctorId: doctor.id,
                serviceId: service.id,
                startsAt: inFuture.toISOString(),
                heldBy: 'u_other_receptionist',
                expiresAt: new Date(now().getTime() + HOLD_MS).toISOString(),
            });
        }, 20_000);
    }

    return () => {
        window.clearInterval(advance);

        if (hold) {
            window.clearInterval(hold);
        }
    };
}
