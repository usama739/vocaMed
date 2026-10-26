import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    formatClock,
    formatDay,
    formatWhen,
} from '@/components/vocamed/booking/format';
import { HoldBanner, useHold } from '@/components/vocamed/booking/hold';
import { SlotPicker } from '@/components/vocamed/booking/slot-picker';
import { TakenNotice } from '@/components/vocamed/booking/taken-notice';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import { LoadingState } from '@/components/vocamed/states';
import { useAsyncValue } from '@/hooks/use-async-value';
import { clockNow } from '@/lib/clock';
import { useT } from '@/i18n/scope';
import {
    addDaysToDate,
    DataError,
    type Appointment,
    type DataSource,
    type Slot,
} from '@/lib/data';

const DAYS_AHEAD = 7;

/**
 * The booking panel's reschedule mode: the patient, doctor and service are fixed, the
 * receptionist only picks a new day and time. Saving moves the existing appointment (it never
 * creates a second one) and the patient is messaged the new time.
 */
export function RescheduleBody({
    source,
    appointment,
    onMoved,
    onClose,
    refreshSlotsMs = 0,
}: {
    source: DataSource;
    appointment: Appointment;
    onMoved?: (appointment: Appointment) => void;
    onClose?: () => void;
    refreshSlotsMs?: number;
}) {
    const { t, locale } = useT();
    const hold = useHold(source);
    const releaseHold = useRef(hold.clear);

    useEffect(() => {
        releaseHold.current = hold.clear;
    });

    useEffect(() => () => releaseHold.current(), []);

    const clinic = useAsyncValue('clinic', () => source.clinic.get()).value;
    const patient = useAsyncValue(`patient:${appointment.patientId}`, () =>
        source.patients.get(appointment.patientId),
    ).value;
    const doctor = useAsyncValue(`doctor:${appointment.doctorId}`, () =>
        source.doctors.get(appointment.doctorId),
    ).value;
    const service = useAsyncValue('services', () =>
        source.services.list(),
    ).value?.find((s) => s.id === appointment.serviceId);

    const tz = clinic?.timezone ?? 'UTC';
    const today = clinic
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(clockNow())
        : null;
    const days = today
        ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysToDate(today, i))
        : [];

    const [date, setDate] = useState<string | null>(null);
    const [slotStart, setSlotStart] = useState<string | null>(null);
    const [alternatives, setAlternatives] = useState<Slot[]>([]);
    const [taken, setTaken] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [moved, setMoved] = useState<string | null>(null);

    const currentDate = date ?? days[0] ?? null;

    const slots = useAsyncValue(
        currentDate ? `reslots:${appointment.id}:${currentDate}` : null,
        () =>
            source.slots.list({
                doctorId: appointment.doctorId,
                serviceId: appointment.serviceId,
                date: currentDate as string,
            }),
        { refreshMs: refreshSlotsMs },
    );

    const pick = async (slot: Slot) => {
        setSlotStart(slot.startsAt);
        setTaken(false);
        setError('');

        try {
            await hold.start({
                doctorId: slot.doctorId,
                serviceId: slot.serviceId,
                startsAt: slot.startsAt,
            });
        } catch (caught) {
            if (caught instanceof DataError) {
                setAlternatives(caught.alternatives);
                setTaken(true);
                setSlotStart(null);
                slots.reload();
            }
        }
    };

    const confirm = async () => {
        if (!slotStart) {
            setError(t('booking.errSlot'));

            return;
        }

        setSaving(true);

        try {
            const next = await source.appointments.reschedule(
                appointment.id,
                slotStart,
            );
            hold.clear();
            setMoved(formatWhen(next.startsAt, tz, locale));
            onMoved?.(next);
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'SLOT_UNAVAILABLE'
            ) {
                setAlternatives(caught.alternatives);
                setTaken(true);
                slots.reload();
            } else if (caught instanceof DataError) {
                setError(caught.message);
            } else {
                throw caught;
            }
        } finally {
            setSaving(false);
        }
    };

    if (!clinic || !patient || !doctor || !service || !currentDate) {
        return <LoadingState rows={5} className="p-5" />;
    }

    if (moved) {
        return (
            <div
                role="status"
                className="flex flex-col items-center gap-3.5 px-7 py-12 text-center"
            >
                <span
                    aria-hidden="true"
                    className="inline-flex size-16 animate-pop items-center justify-center rounded-full bg-status-done text-status-done-ink"
                >
                    <CheckCircle2 className="size-8" />
                </span>
                <h3 className="text-title font-semibold text-ink">
                    {t('booking.movedTitle')}
                </h3>
                <p className="text-control">
                    {patient.name} · {doctor.name} · {moved}
                </p>
                <p className="text-control">{t('booking.movedBody')}</p>
                <Button onClick={onClose} className="mt-2">
                    {t('booking.finish')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-[18px] p-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 rounded-xl border border-line bg-surface-subtle p-4 text-control">
                <dt className="text-subtle">{t('booking.patient')}</dt>
                <dd className="font-semibold text-ink">{patient.name}</dd>
                <dt className="text-subtle">{t('booking.doctor')}</dt>
                <dd className="font-semibold text-ink">{doctor.name}</dd>
                <dt className="text-subtle">{t('booking.service')}</dt>
                <dd className="font-semibold text-ink">{service.name}</dd>
                <dt className="text-subtle">{t('booking.currently')}</dt>
                <dd className="font-semibold text-ink">
                    <span dir="ltr">
                        {formatWhen(appointment.startsAt, tz, locale)}
                    </span>
                </dd>
            </dl>

            <div
                role="group"
                aria-label={t('booking.date')}
                className="flex flex-col gap-1.5"
            >
                <span className="text-label font-semibold text-ink">
                    {t('booking.date')}
                </span>
                <div className="flex flex-wrap gap-2">
                    {days.map((day, index) => (
                        <ChoiceChip
                            key={day}
                            pressed={currentDate === day}
                            onClick={() => {
                                hold.clear();
                                setDate(day);
                                setSlotStart(null);
                                setTaken(false);
                            }}
                        >
                            {index === 0
                                ? t('booking.today')
                                : index === 1
                                  ? t('booking.tomorrow')
                                  : formatDay(day, locale)}
                        </ChoiceChip>
                    ))}
                </div>
            </div>

            <div
                role="group"
                aria-label={t('booking.slot')}
                className="flex flex-col gap-1.5"
            >
                <span className="text-label font-semibold text-ink">
                    {t('booking.slot')}
                </span>
                <SlotPicker
                    slots={slots.value}
                    loading={slots.loading}
                    selected={slotStart}
                    timeZone={tz}
                    onSelect={pick}
                />
            </div>

            {slotStart && !taken && (
                <HoldBanner
                    secondsLeft={hold.secondsLeft}
                    expired={hold.expired}
                    onHoldAgain={() =>
                        void hold.start({
                            doctorId: appointment.doctorId,
                            serviceId: appointment.serviceId,
                            startsAt: slotStart,
                        })
                    }
                />
            )}

            {taken && (
                <TakenNotice
                    time={slotStart ? formatClock(slotStart, tz) : ''}
                    alternatives={alternatives}
                    timeZone={tz}
                    onPick={(slot) => void pick(slot)}
                />
            )}

            {error && (
                <p
                    role="alert"
                    className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-3 text-control text-danger-deep"
                >
                    {error}
                </p>
            )}

            <Button
                size="lg"
                disabled={saving || hold.expired || !slotStart}
                onClick={confirm}
                className="self-start"
            >
                {saving && (
                    <Loader2
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
                    />
                )}
                {t('booking.confirmMove')}
            </Button>

            <p className="mt-auto text-small text-subtle">
                {t('booking.sample')}
            </p>
        </div>
    );
}
