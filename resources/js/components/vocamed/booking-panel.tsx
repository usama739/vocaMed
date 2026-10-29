import {
    CheckCircle2,
    Loader2,
    Minus,
    Plus,
    TriangleAlert,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { HoldBanner, useHold } from '@/components/vocamed/booking/hold';
import { RescheduleBody } from '@/components/vocamed/booking/reschedule';
import { TakenNotice } from '@/components/vocamed/booking/taken-notice';
import {
    formatClock,
    formatDay,
    formatWhen,
} from '@/components/vocamed/booking/format';
import { PatientPicker } from '@/components/vocamed/booking/patient-picker';
import { SlotPicker } from '@/components/vocamed/booking/slot-picker';
import { ChoiceChip } from '@/components/vocamed/choice-chip';
import {
    FormField,
    PhoneField,
    TextareaField,
} from '@/components/vocamed/form-fields';
import { LoadingState } from '@/components/vocamed/states';
import {
    VoiceCaptureButton,
    type VoiceState,
} from '@/components/vocamed/voice-capture-button';
import { useAsyncValue } from '@/hooks/use-async-value';
import { useShortcut } from '@/hooks/use-shortcut';
import { clockNow } from '@/lib/clock';
import { useT } from '@/i18n/scope';
import {
    addDaysToDate,
    data as defaultSource,
    DataError,
    type Appointment,
    type DataSource,
    type Id,
    type IsoDateTime,
    type Patient,
    type Slot,
} from '@/lib/data';
import { cn } from '@/lib/utils';

type Tab = 'voice' | 'manual';
type Phase = VoiceState | 'review' | 'taken';

/** What the voice step hands to the review card. Every field stays editable before booking. */
export type ReviewDraft = {
    heard: string;
    patientName: string;
    phone: string;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    /** Fields the speech model was unsure about; highlighted so the receptionist checks them. */
    lowConfidence: 'patient'[];
};

export type Interpret = (
    text: string,
    source: DataSource,
) => Promise<ReviewDraft | null>;

/**
 * Stand-in for the real speech-to-booking step (Whisper on the server). It builds a draft from
 * the sample data so the review card, hold and confirm flow can be built and tested now.
 * Replace it by passing `interpret` to the panel.
 */
export const sampleInterpret: Interpret = async (text, source) => {
    const [patient] = await source.patients.recent(1);
    const doctors = await source.doctors.list({ activeOnly: true });
    const services = await source.services.list({ activeOnly: true });
    const doctor = doctors[0];
    const service = services.find((s) => doctor?.serviceIds.includes(s.id));
    const slot =
        doctor && service
            ? await source.doctors.nextFreeSlot(doctor.id, service.id)
            : null;

    if (!patient || !doctor || !service || !slot) {
        return null;
    }

    return {
        heard: text,
        patientName: patient.name,
        phone: patient.phone,
        doctorId: doctor.id,
        serviceId: service.id,
        startsAt: slot.startsAt,
        lowConfidence: ['patient'],
    };
};

export type BookingPanelInitial = {
    tab?: Tab;
    /** Open on a given voice state; used by the preview. */
    phase?: Phase;
    done?: boolean;
    doctorId?: Id;
    startsAt?: IsoDateTime;
    /** Open the Manual tab with this patient already chosen ("Book appointment" on a profile). */
    patient?: Patient;
};

const DAYS_AHEAD = 3;

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
    const { t, isRtl } = useT();
    const order: Tab[] = ['voice', 'manual'];
    const refs = useRef<Record<Tab, HTMLButtonElement | null>>({
        voice: null,
        manual: null,
    });

    const onKeyDown = (event: KeyboardEvent) => {
        const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
        const back = isRtl ? 'ArrowRight' : 'ArrowLeft';

        if (event.key !== forward && event.key !== back) {
            return;
        }

        event.preventDefault();
        const next = order[(order.indexOf(tab) + 1) % order.length];
        onChange(next);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="tablist"
            aria-label={t('booking.title')}
            onKeyDown={onKeyDown}
            className="flex gap-2 px-5 pt-3"
        >
            {order.map((key) => (
                <button
                    key={key}
                    ref={(node) => {
                        refs.current[key] = node;
                    }}
                    id={`booking-tab-${key}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls={`booking-panel-${key}`}
                    tabIndex={tab === key ? 0 : -1}
                    onClick={() => onChange(key)}
                    className={cn(
                        'min-h-12 border-b-[3px] px-5 text-control font-bold',
                        tab === key
                            ? 'border-brand text-brand-deep'
                            : 'border-transparent text-copy hover:text-ink',
                    )}
                >
                    {t(`booking.${key}`)}
                </button>
            ))}
        </div>
    );
}

/**
 * The booking panel's content: a Voice tab and a Manual tab over the same data source.
 * Nothing is booked until Confirm is pressed. Use `BookingPanel` (slide-over) in the app.
 */
export function BookingPanelBody({
    source = defaultSource,
    initial = {},
    interpret = sampleInterpret,
    onBooked,
    onClose,
    enableShortcuts = false,
    refreshSlotsMs = 0,
}: {
    source?: DataSource;
    initial?: BookingPanelInitial;
    interpret?: Interpret;
    onBooked?: (appointment: Appointment) => void;
    onClose?: () => void;
    /** M starts voice while the panel is open. */
    enableShortcuts?: boolean;
    /** Poll for slots taken or held by others (real-time updates replace this later). */
    refreshSlotsMs?: number;
}) {
    const { t, locale } = useT();
    const hold = useHold(source);

    const clinic = useAsyncValue('clinic', () => source.clinic.get()).value;
    const doctors = useAsyncValue('doctors', () =>
        source.doctors.list({ activeOnly: true }),
    ).value;
    const services = useAsyncValue('services', () =>
        source.services.list({ activeOnly: true }),
    ).value;
    const today = useAsyncValue('today', () =>
        source.clinic.get().then((c) =>
            new Intl.DateTimeFormat('en-CA', {
                timeZone: c.timezone,
            }).format(clockNow()),
        ),
    ).value;

    const [tab, setTab] = useState<Tab>(
        initial.tab ??
            (initial.doctorId || initial.patient ? 'manual' : 'voice'),
    );
    const [phase, setPhase] = useState<Phase>(
        initial.phase === 'review' || initial.phase === 'taken'
            ? 'transcribing'
            : (initial.phase ?? 'idle'),
    );
    const [typed, setTyped] = useState('');
    const [draft, setDraft] = useState<ReviewDraft | null>(null);
    const [alternatives, setAlternatives] = useState<Slot[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<string | null>(initial.done ? '' : null);

    const [manual, setManual] = useState({
        query: '',
        patient: (initial.patient ?? null) as Patient | null,
        creating: false,
        newName: '',
        newPhone: '',
        doctorId: initial.doctorId ?? null,
        serviceId: null as Id | null,
        date: null as string | null,
        slotStart: initial.startsAt ?? null,
        notes: '',
    });

    const ready = !!(clinic && doctors && services && today);
    const tz = clinic?.timezone ?? 'UTC';
    const days = today
        ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysToDate(today, i))
        : [];

    const offered = (doctorId: Id | undefined) => {
        const doctor = doctors?.find((d) => d.id === doctorId);

        return (services ?? []).filter((s) =>
            doctor?.serviceIds.includes(s.id),
        );
    };

    // ---- manual tab ----
    const mDoctorId = manual.doctorId ?? doctors?.[0]?.id;
    const mOffered = offered(mDoctorId);
    const mServiceId = mOffered.some((s) => s.id === manual.serviceId)
        ? manual.serviceId
        : mOffered[0]?.id;
    const mDate =
        manual.date ??
        (initial.startsAt
            ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
                  new Date(initial.startsAt),
              )
            : days[0]);

    const mSlots = useAsyncValue(
        ready && mDoctorId && mServiceId && mDate
            ? `slots:${mDoctorId}:${mServiceId}:${mDate}`
            : null,
        () =>
            source.slots.list({
                doctorId: mDoctorId as Id,
                serviceId: mServiceId as Id,
                date: mDate as string,
            }),
        { refreshMs: refreshSlotsMs },
    );

    const patchManual = (patch: Partial<typeof manual>) => {
        setError('');

        if (patch.slotStart === null) {
            hold.clear();
        }

        setManual((m) => ({ ...m, ...patch }));
    };

    const pickManualSlot = async (slot: Slot) => {
        patchManual({ slotStart: slot.startsAt });

        try {
            await hold.start({
                doctorId: slot.doctorId,
                serviceId: slot.serviceId,
                startsAt: slot.startsAt,
            });
        } catch (caught) {
            if (caught instanceof DataError) {
                setAlternatives(caught.alternatives);
                setError('taken');
                patchManual({ slotStart: null });
                mSlots.reload();
            }
        }
    };

    // Opened on a calendar slot: hold that slot for this receptionist, as if they had tapped it.
    const seededHold = useRef(false);
    const startHold = hold.start;

    useEffect(() => {
        if (
            seededHold.current ||
            !ready ||
            !initial.startsAt ||
            !initial.doctorId ||
            !mServiceId
        ) {
            return;
        }

        seededHold.current = true;
        const startsAt = initial.startsAt;
        const doctorId = initial.doctorId;
        const serviceId = mServiceId;

        startHold({ doctorId, serviceId, startsAt }).catch(
            (caught: unknown) => {
                if (caught instanceof DataError) {
                    setAlternatives(caught.alternatives);
                    setError('taken');
                    setManual((m) => ({ ...m, slotStart: null }));
                }
            },
        );
    }, [ready, initial.startsAt, initial.doctorId, mServiceId, startHold]);

    const finish = (appointment: Appointment, patientName: string) => {
        const doctor = doctors?.find((d) => d.id === appointment.doctorId);
        setDone(
            `${patientName} · ${doctor?.name ?? ''} · ${formatWhen(appointment.startsAt, tz, locale)}`,
        );
        hold.clear();
        onBooked?.(appointment);
    };

    const confirmManual = async () => {
        if (!manual.patient && !(manual.creating && manual.newName.trim())) {
            setError(
                manual.creating
                    ? t('booking.errName')
                    : t('booking.errPatient'),
            );

            return;
        }

        if (!manual.slotStart || !mDoctorId || !mServiceId) {
            setError(t('booking.errSlot'));

            return;
        }

        setSaving(true);

        try {
            const patient =
                manual.patient ??
                (await source.patients.create({
                    name: manual.newName,
                    phone: manual.newPhone,
                }));
            const appointment = await source.appointments.create({
                patientId: patient.id,
                doctorId: mDoctorId,
                serviceId: mServiceId,
                startsAt: manual.slotStart,
                source: 'manual',
                notes: manual.notes.trim() || undefined,
            });
            finish(appointment, patient.name);
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'SLOT_UNAVAILABLE'
            ) {
                setAlternatives(caught.alternatives);
                setError('taken');
                mSlots.reload();
            } else if (caught instanceof DataError) {
                setError(caught.message);
            } else {
                throw caught;
            }
        } finally {
            setSaving(false);
        }
    };

    // ---- voice tab ----
    const candidates = useAsyncValue(
        ready && draft ? `cand:${draft.doctorId}:${draft.serviceId}` : null,
        async () => {
            const found: Slot[] = [];

            for (const date of days) {
                const slots = await source.slots.list({
                    doctorId: draft?.doctorId as Id,
                    serviceId: draft?.serviceId as Id,
                    date,
                });
                found.push(
                    ...slots.filter((s) => s.state === 'free' || s.heldByMe),
                );
            }

            return found;
        },
    ).value;

    const effectiveStart =
        draft && candidates
            ? candidates.some((s) => s.startsAt === draft.startsAt)
                ? draft.startsAt
                : (candidates[0]?.startsAt ?? draft.startsAt)
            : (draft?.startsAt ?? null);
    const candidateIndex = candidates?.findIndex(
        (s) => s.startsAt === effectiveStart,
    );

    const holdStart = hold.start;
    const heldAt = hold.hold?.startsAt;
    const holding = useRef<string | null>(null);
    const draftDoctor = draft?.doctorId;
    const draftService = draft?.serviceId;

    // Whenever the review card lands on a slot, hold it for this user.
    useEffect(() => {
        if (
            phase !== 'review' ||
            !draftDoctor ||
            !draftService ||
            !effectiveStart ||
            heldAt === effectiveStart ||
            holding.current === effectiveStart
        ) {
            return;
        }

        holding.current = effectiveStart;

        holdStart({
            doctorId: draftDoctor,
            serviceId: draftService,
            startsAt: effectiveStart,
        })
            .catch((caught: unknown) => {
                if (caught instanceof DataError) {
                    setAlternatives(caught.alternatives);
                    setPhase('taken');
                }
            })
            .finally(() => {
                holding.current = null;
            });
    }, [phase, draftDoctor, draftService, effectiveStart, heldAt, holdStart]);

    const runInterpret = async (text: string) => {
        setPhase('transcribing');
        setError('');
        const result = await interpret(text, source);

        if (!result) {
            setPhase('error');

            return;
        }

        setDraft(result);
        setPhase('review');
    };

    const onMic = () => {
        if (phase === 'idle' || phase === 'error') {
            setPhase('listening');
        } else if (phase === 'listening') {
            void runInterpret(t('booking.sampleTranscript'));
        }
    };

    useShortcut('m', onMic, enableShortcuts && tab === 'voice');

    // The preview opens the panel already in a review / taken state.
    const seeded = useRef(false);

    useEffect(() => {
        if (
            seeded.current ||
            !ready ||
            (initial.phase !== 'review' && initial.phase !== 'taken')
        ) {
            return;
        }

        seeded.current = true;

        void (async () => {
            const result = await interpret(
                t('booking.sampleTranscript'),
                source,
            );

            if (!result) {
                setPhase('error');

                return;
            }

            setDraft(result);

            if (initial.phase === 'taken') {
                setAlternatives(
                    await source.slots.alternatives({
                        doctorId: result.doctorId,
                        serviceId: result.serviceId,
                        startsAt: result.startsAt,
                    }),
                );
                setPhase('taken');
            } else {
                setPhase('review');
            }
        })();
    }, [ready, initial.phase, interpret, source, t]);

    const patchDraft = (patch: Partial<ReviewDraft>) =>
        setDraft((d) => (d ? { ...d, ...patch } : d));

    const resetVoice = () => {
        hold.clear();
        setDraft(null);
        setPhase('idle');
        setError('');
    };

    const confirmVoice = async () => {
        if (!draft || !effectiveStart || hold.expired) {
            return;
        }

        setSaving(true);

        try {
            const [existing] = await source.patients.search(draft.phone, 1);
            const patient =
                existing ??
                (await source.patients.create({
                    name: draft.patientName,
                    phone: draft.phone,
                }));
            const appointment = await source.appointments.create({
                patientId: patient.id,
                doctorId: draft.doctorId,
                serviceId: draft.serviceId,
                startsAt: effectiveStart,
                source: 'voice',
            });
            finish(appointment, patient.name);
        } catch (caught) {
            if (
                caught instanceof DataError &&
                caught.code === 'SLOT_UNAVAILABLE'
            ) {
                setAlternatives(caught.alternatives);
                setPhase('taken');
            } else if (caught instanceof DataError) {
                setError(caught.message);
            } else {
                throw caught;
            }
        } finally {
            setSaving(false);
        }
    };

    const restart = () => {
        setDone(null);
        setDraft(null);
        setPhase('idle');
        setTyped('');
        setError('');
        setManual((m) => ({
            ...m,
            patient: null,
            creating: false,
            newName: '',
            newPhone: '',
            slotStart: null,
            notes: '',
        }));
    };

    if (!ready) {
        return <LoadingState rows={5} className="p-5" />;
    }

    if (done !== null) {
        return (
            <div className="flex flex-1 flex-col">
                <div
                    role="status"
                    className="flex flex-col items-center gap-3.5 px-7 py-12 text-center"
                >
                    <span
                        aria-hidden="true"
                        className="inline-flex size-16 items-center justify-center rounded-full bg-status-done text-status-done-ink"
                    >
                        <CheckCircle2 className="size-8" />
                    </span>
                    <h3 className="text-title font-semibold text-ink">
                        {t('booking.doneTitle')}
                    </h3>
                    {done && <p className="text-control">{done}</p>}
                    <p className="text-control">{t('booking.doneBody')}</p>
                    <div className="mt-2 flex flex-wrap justify-center gap-2.5">
                        <Button variant="outline" onClick={restart}>
                            {t('booking.another')}
                        </Button>
                        <Button onClick={onClose}>{t('booking.finish')}</Button>
                    </div>
                </div>
                <SampleNote />
            </div>
        );
    }

    const reviewDoctorOffered = offered(draft?.doctorId);

    return (
        <div className="flex flex-1 flex-col">
            <Tabs tab={tab} onChange={setTab} />

            {tab === 'voice' && (
                <div
                    role="tabpanel"
                    id="booking-panel-voice"
                    aria-labelledby="booking-tab-voice"
                    className="flex flex-col gap-[18px] p-5"
                >
                    {(phase === 'idle' ||
                        phase === 'listening' ||
                        phase === 'error' ||
                        phase === 'denied') && (
                        <>
                            <VoiceCaptureButton
                                state={phase}
                                onToggle={onMic}
                                onTypeInstead={() =>
                                    document
                                        .getElementById('booking-typed')
                                        ?.focus()
                                }
                            />
                            <form
                                className="flex flex-col gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();

                                    if (typed.trim()) {
                                        void runInterpret(typed.trim());
                                    }
                                }}
                            >
                                <label
                                    htmlFor="booking-typed"
                                    className="text-label font-semibold text-ink"
                                >
                                    {t('booking.typeLabel')}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="booking-typed"
                                        type="text"
                                        value={typed}
                                        onChange={(event) =>
                                            setTyped(event.target.value)
                                        }
                                        placeholder={t(
                                            'booking.typePlaceholder',
                                        )}
                                        className="h-12 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-3.5 text-body text-ink placeholder:text-subtle"
                                    />
                                    <Button type="submit">
                                        {t('booking.go')}
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}

                    {phase === 'transcribing' && (
                        <div
                            role="status"
                            className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle px-4 py-3.5 text-control text-ink"
                        >
                            <Loader2
                                aria-hidden="true"
                                className="size-4 animate-spin text-brand motion-reduce:animate-none"
                            />
                            {t('booking.working')}
                        </div>
                    )}

                    {(phase === 'review' || phase === 'taken') && draft && (
                        <div className="flex flex-col gap-3.5">
                            {phase === 'taken' ? (
                                <TakenNotice
                                    time={formatClock(draft.startsAt, tz)}
                                    alternatives={alternatives}
                                    timeZone={tz}
                                    onPick={(slot) => {
                                        patchDraft({ startsAt: slot.startsAt });
                                        setPhase('review');
                                    }}
                                />
                            ) : (
                                <HoldBanner
                                    secondsLeft={hold.secondsLeft}
                                    expired={hold.expired}
                                    onHoldAgain={() =>
                                        effectiveStart &&
                                        void hold.start({
                                            doctorId: draft.doctorId,
                                            serviceId: draft.serviceId,
                                            startsAt: effectiveStart,
                                        })
                                    }
                                />
                            )}

                            <div className="flex flex-col gap-3 rounded-xl border border-line p-4 shadow-soft">
                                <strong className="text-control text-ink">
                                    {t('booking.reviewTitle')}
                                </strong>
                                <span className="text-small text-subtle">
                                    {t('booking.heard')}{' '}
                                    <em className="text-ink not-italic">
                                        “{draft.heard}”
                                    </em>
                                </span>

                                <FormField label={t('booking.patient')}>
                                    {(control) => (
                                        <div className="flex flex-col gap-1.5">
                                            {draft.lowConfidence.includes(
                                                'patient',
                                            ) && (
                                                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-warning-line bg-warning-surface px-2.5 py-0.5 text-caption font-bold text-warning-ink">
                                                    <TriangleAlert
                                                        aria-hidden="true"
                                                        className="size-[13px]"
                                                    />
                                                    {t('booking.check')}
                                                </span>
                                            )}
                                            <input
                                                {...control}
                                                type="text"
                                                value={draft.patientName}
                                                onChange={(event) =>
                                                    patchDraft({
                                                        patientName:
                                                            event.target.value,
                                                        lowConfidence: [],
                                                    })
                                                }
                                                className={cn(
                                                    'h-12 w-full rounded-md bg-white px-3.5 text-body text-ink',
                                                    draft.lowConfidence.includes(
                                                        'patient',
                                                    )
                                                        ? 'border-2 border-warning-accent'
                                                        : 'border border-line-strong',
                                                )}
                                            />
                                        </div>
                                    )}
                                </FormField>

                                <PhoneField
                                    label={t('booking.phone')}
                                    countryCode={clinic?.phoneCountryCode}
                                    value={draft.phone}
                                    onValueChange={(phone) =>
                                        patchDraft({ phone })
                                    }
                                />

                                <div
                                    role="group"
                                    aria-label={t('booking.doctor')}
                                    className="flex flex-col gap-1.5"
                                >
                                    <span className="text-label font-semibold text-ink">
                                        {t('booking.doctor')}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {(doctors ?? []).map((doctor) => (
                                            <ChoiceChip
                                                key={doctor.id}
                                                pressed={
                                                    draft.doctorId === doctor.id
                                                }
                                                onClick={() =>
                                                    patchDraft({
                                                        doctorId: doctor.id,
                                                        serviceId:
                                                            offered(
                                                                doctor.id,
                                                            )[0]?.id ??
                                                            draft.serviceId,
                                                    })
                                                }
                                            >
                                                {doctor.name}
                                            </ChoiceChip>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    role="group"
                                    aria-label={t('booking.service')}
                                    className="flex flex-col gap-1.5"
                                >
                                    <span className="text-label font-semibold text-ink">
                                        {t('booking.service')}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {reviewDoctorOffered.map((service) => (
                                            <ChoiceChip
                                                key={service.id}
                                                pressed={
                                                    draft.serviceId ===
                                                    service.id
                                                }
                                                onClick={() =>
                                                    patchDraft({
                                                        serviceId: service.id,
                                                    })
                                                }
                                            >
                                                {service.name}
                                            </ChoiceChip>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    role="group"
                                    aria-label={t('booking.when')}
                                    className="flex flex-col gap-1.5"
                                >
                                    <span className="text-label font-semibold text-ink">
                                        {t('booking.when')}
                                    </span>
                                    <div className="flex items-center gap-2.5">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            aria-label={t('booking.earlier')}
                                            disabled={
                                                !candidateIndex ||
                                                candidateIndex <= 0
                                            }
                                            onClick={() =>
                                                candidates &&
                                                patchDraft({
                                                    startsAt:
                                                        candidates[
                                                            (candidateIndex ??
                                                                0) - 1
                                                        ].startsAt,
                                                })
                                            }
                                        >
                                            <Minus aria-hidden="true" />
                                        </Button>
                                        <span
                                            dir="ltr"
                                            className="min-w-[150px] text-center text-lead font-bold text-ink"
                                        >
                                            {effectiveStart
                                                ? formatWhen(
                                                      effectiveStart,
                                                      tz,
                                                      locale,
                                                  )
                                                : '—'}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            aria-label={t('booking.later')}
                                            disabled={
                                                !candidates ||
                                                candidateIndex === undefined ||
                                                candidateIndex >=
                                                    candidates.length - 1
                                            }
                                            onClick={() =>
                                                candidates &&
                                                patchDraft({
                                                    startsAt:
                                                        candidates[
                                                            (candidateIndex ??
                                                                0) + 1
                                                        ].startsAt,
                                                })
                                            }
                                        >
                                            <Plus aria-hidden="true" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {error && error !== 'taken' && (
                                <p
                                    role="alert"
                                    className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-3 text-control text-danger-deep"
                                >
                                    {error}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2.5">
                                <Button
                                    size="lg"
                                    disabled={
                                        saving ||
                                        hold.expired ||
                                        phase === 'taken'
                                    }
                                    onClick={confirmVoice}
                                >
                                    {saving && (
                                        <Loader2
                                            aria-hidden="true"
                                            className="animate-spin motion-reduce:animate-none"
                                        />
                                    )}
                                    {t('booking.confirm')}
                                </Button>
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={resetVoice}
                                >
                                    {t('booking.recordAgain')}
                                </Button>
                                <Button
                                    size="lg"
                                    variant="outline-destructive"
                                    onClick={() => {
                                        setTyped('');
                                        resetVoice();
                                    }}
                                >
                                    {t('booking.discard')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === 'manual' && (
                <div
                    role="tabpanel"
                    id="booking-panel-manual"
                    aria-labelledby="booking-tab-manual"
                    className="flex flex-col gap-[18px] p-5"
                >
                    <PatientPicker
                        source={source}
                        countryCode={clinic?.phoneCountryCode ?? '+92'}
                        selected={manual.patient}
                        onSelect={(patient) => patchManual({ patient })}
                        creating={manual.creating}
                        onCreatingChange={(creating) =>
                            patchManual({ creating })
                        }
                        newName={manual.newName}
                        onNewNameChange={(newName) => patchManual({ newName })}
                        newPhone={manual.newPhone}
                        onNewPhoneChange={(newPhone) =>
                            patchManual({ newPhone })
                        }
                    />

                    <div
                        role="group"
                        aria-label={t('booking.doctor')}
                        className="flex flex-col gap-1.5"
                    >
                        <span className="text-label font-semibold text-ink">
                            {t('booking.doctor')}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {(doctors ?? []).map((doctor) => (
                                <ChoiceChip
                                    key={doctor.id}
                                    pressed={mDoctorId === doctor.id}
                                    onClick={() =>
                                        patchManual({
                                            doctorId: doctor.id,
                                            serviceId: null,
                                            slotStart: null,
                                        })
                                    }
                                >
                                    {doctor.name}
                                </ChoiceChip>
                            ))}
                        </div>
                    </div>

                    <div
                        role="group"
                        aria-label={t('booking.service')}
                        className="flex flex-col gap-1.5"
                    >
                        <span className="text-label font-semibold text-ink">
                            {t('booking.service')}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {mOffered.map((service) => (
                                <ChoiceChip
                                    key={service.id}
                                    pressed={mServiceId === service.id}
                                    onClick={() =>
                                        patchManual({
                                            serviceId: service.id,
                                            slotStart: null,
                                        })
                                    }
                                >
                                    {service.name}
                                </ChoiceChip>
                            ))}
                        </div>
                    </div>

                    <div
                        role="group"
                        aria-label={t('booking.date')}
                        className="flex flex-col gap-1.5"
                    >
                        <span className="text-label font-semibold text-ink">
                            {t('booking.date')}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {days.map((date, index) => (
                                <ChoiceChip
                                    key={date}
                                    pressed={mDate === date}
                                    onClick={() =>
                                        patchManual({ date, slotStart: null })
                                    }
                                >
                                    {index === 0
                                        ? t('booking.today')
                                        : index === 1
                                          ? t('booking.tomorrow')
                                          : formatDay(date, locale)}
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
                            slots={mSlots.value}
                            loading={mSlots.loading}
                            selected={manual.slotStart}
                            timeZone={tz}
                            onSelect={pickManualSlot}
                        />
                    </div>

                    {manual.slotStart && !error && (
                        <HoldBanner
                            secondsLeft={hold.secondsLeft}
                            expired={hold.expired}
                            onHoldAgain={() =>
                                mDoctorId &&
                                mServiceId &&
                                manual.slotStart &&
                                void hold.start({
                                    doctorId: mDoctorId,
                                    serviceId: mServiceId,
                                    startsAt: manual.slotStart,
                                })
                            }
                        />
                    )}

                    <TextareaField
                        label={t('booking.notes')}
                        rows={2}
                        value={manual.notes}
                        placeholder={t('booking.notesPlaceholder')}
                        onChange={(event) =>
                            patchManual({ notes: event.target.value })
                        }
                    />

                    {error === 'taken' && (
                        <TakenNotice
                            time={
                                manual.slotStart
                                    ? formatClock(manual.slotStart, tz)
                                    : ''
                            }
                            alternatives={alternatives}
                            timeZone={tz}
                            onPick={(slot) => {
                                setError('');
                                void pickManualSlot(slot);
                            }}
                        />
                    )}
                    {error && error !== 'taken' && (
                        <p
                            role="alert"
                            className="rounded-lg border border-danger-line bg-danger-surface px-3.5 py-3 text-control text-danger-deep"
                        >
                            {error}
                        </p>
                    )}

                    <Button
                        size="lg"
                        disabled={saving}
                        onClick={confirmManual}
                        className="self-start"
                    >
                        {saving && (
                            <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {t('booking.confirm')}
                    </Button>
                </div>
            )}

            <SampleNote />
        </div>
    );
}

function SampleNote() {
    const { t } = useT();

    return (
        <p className="mx-5 mt-auto mb-5 text-small text-subtle">
            {t('booking.sample')}
        </p>
    );
}

/** The panel as a card (header + body), for inline previews. */
export function BookingPanelCard(
    props: Parameters<typeof BookingPanelBody>[0],
) {
    const { t } = useT();

    return (
        <div className="flex min-h-[520px] flex-col rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3.5 ps-5 pe-3.5">
                <h2 className="text-title font-semibold text-ink">
                    {t('booking.title')}
                </h2>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('booking.close')}
                    onClick={props.onClose}
                >
                    <X aria-hidden="true" />
                </Button>
            </div>
            <BookingPanelBody {...props} />
        </div>
    );
}

/**
 * The global "New booking" slide-over, opened from any receptionist page (button or N).
 * Pass `prefill` to open the Manual tab on a doctor and slot (clicking an empty calendar slot).
 */
export function BookingPanel({
    open,
    onOpenChange,
    source,
    prefill,
    interpret,
    onBooked,
    reschedule,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    source?: DataSource;
    prefill?: BookingPanelInitial;
    interpret?: Interpret;
    onBooked?: (appointment: Appointment) => void;
    /** Move this appointment instead of booking a new one. */
    reschedule?: Appointment | null;
}) {
    const { t, locale, dir } = useT();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                dir={dir}
                lang={locale}
                aria-describedby={undefined}
                className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
            >
                <SheetHeader className="border-b border-line-soft p-5 pe-16">
                    <SheetTitle>
                        {reschedule
                            ? t('booking.rescheduleTitle')
                            : t('booking.title')}
                    </SheetTitle>
                </SheetHeader>
                {reschedule ? (
                    <RescheduleBody
                        source={source ?? defaultSource}
                        appointment={reschedule}
                        onMoved={onBooked}
                        onClose={() => onOpenChange(false)}
                        refreshSlotsMs={5000}
                    />
                ) : (
                    <BookingPanelBody
                        source={source}
                        interpret={interpret}
                        initial={prefill}
                        onBooked={onBooked}
                        onClose={() => onOpenChange(false)}
                        enableShortcuts
                        refreshSlotsMs={5000}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}
