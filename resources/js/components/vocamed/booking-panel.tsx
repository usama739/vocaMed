import {
    CheckCircle2,
    Loader2,
    MicOff,
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
import {
    MIN_RECORDING_SECONDS,
    useVoiceRecorder,
} from '@/hooks/use-voice-recorder';
import { clockNow } from '@/lib/clock';
import { SLOT_TOPICS } from '@/lib/live-topics';
import { useT } from '@/i18n/scope';
import {
    addDaysToDate,
    data as defaultSource,
    DataError,
    failureOfError,
    voiceOutcome,
    waitForVoice,
    type Appointment,
    type DataSource,
    type Id,
    type IsoDateTime,
    type Patient,
    type Slot,
    type VoiceCheck,
    type VoiceFailure,
    type VoiceOutcome,
} from '@/lib/data';
import { cn } from '@/lib/utils';

type Tab = 'voice' | 'manual';
type Phase = VoiceState | 'review' | 'taken';

/** Why a voice request ended without a draft: a failure, or a request that was not a booking. */
type VoiceMessage = VoiceFailure | 'notBooking';

const VOICE_MESSAGE = {
    noSpeech: 'voice.noSpeech',
    busy: 'voice.busy',
    notSetUp: 'voice.notSetUp',
    off: 'voice.off',
    notBooking: 'voice.notBooking',
} as const;

/** What the voice step hands to the review card. Every field stays editable before booking. */
export type ReviewDraft = {
    heard: string;
    /** The patient the server matched; null for a new patient (the name and phone are what was heard). */
    patientId?: Id | null;
    patientName: string;
    phone: string;
    doctorId: Id;
    serviceId: Id;
    startsAt: IsoDateTime;
    /** Fields the server was unsure about; highlighted so the receptionist checks them. */
    lowConfidence: VoiceCheck[];
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

/** The "please check" tag on a field the server was unsure of. */
function CheckBadge() {
    const { t } = useT();

    return (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-warning-line bg-warning-surface px-2.5 py-0.5 text-caption font-bold text-warning-ink">
            <TriangleAlert aria-hidden="true" className="size-[13px]" />
            {t('booking.check')}
        </span>
    );
}

function Tabs({
    tab,
    order,
    onChange,
}: {
    tab: Tab;
    order: Tab[];
    onChange: (tab: Tab) => void;
}) {
    const { t, isRtl } = useT();
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
    const clinicSettings = useAsyncValue('clinic-settings', () =>
        source.clinic.settings(),
    ).value;

    // With a real voice service the clinic can switch voice off in its settings (a new clinic starts with it off), and the server then
    // refuses both ways of asking. The Voice tab stays, so nobody wonders where it went, and says why; the panel opens on Manual instead.
    // The open demo has no service and keeps its sample interpreter.
    const voice = source.voice;
    const voiceAvailable = !voice || clinicSettings?.voiceEnabled !== false;
    const tabs: Tab[] = ['voice', 'manual'];

    // The person's own choice of tab; until they make one the panel opens on Voice, or on Manual when voice is off.
    const [chosenTab, setChosenTab] = useState<Tab | null>(
        initial.tab ?? (initial.doctorId || initial.patient ? 'manual' : null),
    );
    const activeTab: Tab = chosenTab ?? (voiceAvailable ? 'voice' : 'manual');
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
    const [voiceMessage, setVoiceMessage] = useState<VoiceMessage | null>(null);
    /** What voice understood of a request that could not be finished on the review card (shown on the Manual tab). */
    const [voiceNote, setVoiceNote] = useState<string | null>(null);
    const waiting = useRef<AbortController | null>(null);

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
        { refreshMs: refreshSlotsMs, topics: SLOT_TOPICS },
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
    // The next few days, plus the days around the one the server picked (a request for next Tuesday is not within three days of today).
    const draftDate = draft
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
              new Date(draft.startsAt),
          )
        : null;
    const candidateDays =
        draftDate && !days.includes(draftDate)
            ? [
                  ...days,
                  ...Array.from({ length: DAYS_AHEAD }, (_, i) =>
                      addDaysToDate(draftDate, i),
                  ),
              ]
            : days;

    const candidates = useAsyncValue(
        ready && draft
            ? `cand:${draft.doctorId}:${draft.serviceId}:${draftDate}`
            : null,
        async () => {
            const found: Slot[] = [];

            for (const date of candidateDays) {
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

    /** What to do with a finished voice request: the review card, the Manual tab for a partial one, or a message. */
    const applyOutcome = async (outcome: VoiceOutcome) => {
        if (outcome.kind === 'review') {
            setDraft({ ...outcome.draft });
            setPhase('review');

            return;
        }

        if (outcome.kind === 'partial') {
            const found = outcome.draft;
            const patient = found.patientId
                ? await source.patients.get(found.patientId).catch(() => null)
                : null;

            setManual((m) => ({
                ...m,
                patient,
                creating: !patient && !!(found.patientName || found.phone),
                newName: patient ? '' : found.patientName,
                newPhone: patient ? '' : found.phone,
                doctorId: found.doctorId ?? m.doctorId,
                serviceId: found.serviceId ?? m.serviceId,
                date: found.startsAt
                    ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
                          new Date(found.startsAt),
                      )
                    : m.date,
                slotStart: null,
            }));
            setVoiceNote(found.heard);
            setPhase('idle');
            setChosenTab('manual');

            return;
        }

        setVoiceMessage(
            outcome.kind === 'notBooking' ? 'notBooking' : outcome.reason,
        );
        setPhase('error');
    };

    /** Sends a request (a recording or typed text) to the voice service and waits for what it made of it. */
    const runVoice = async (send: () => Promise<{ id: Id }>) => {
        if (!voice) {
            return;
        }

        waiting.current?.abort();
        const controller = new AbortController();
        waiting.current = controller;

        setPhase('transcribing');
        setError('');
        setVoiceMessage(null);

        try {
            const { id } = await send();
            const view = await waitForVoice(voice, id, {
                signal: controller.signal,
            });

            if (!controller.signal.aborted) {
                await applyOutcome(voiceOutcome(view));
            }
        } catch (caught) {
            if (!controller.signal.aborted) {
                setVoiceMessage(failureOfError(caught));
                setPhase('error');
            }
        }
    };

    const runInterpret = async (text: string) => {
        if (voice) {
            await runVoice(() => voice.parseText(text));

            return;
        }

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

    const recorder = useVoiceRecorder({
        onRecorded: ({ blob, seconds }) => {
            if (!voice) {
                return;
            }

            // Too short to hold any words: say so, rather than spend a request on it.
            if (seconds < MIN_RECORDING_SECONDS) {
                setVoiceMessage('noSpeech');
                setPhase('error');

                return;
            }

            void runVoice(() => voice.transcribe(blob, seconds));
        },
        onError: () => {
            setVoiceMessage(null);
            setPhase('error');
        },
    });

    // What the voice control shows: the microphone's own state wins while it is recording or cannot be used (a browser that cannot record,
    // or a person who said no), otherwise the panel's own step.
    const recorderState = recorder.state;
    const voicePhase: Phase = !voice
        ? phase
        : recorderState === 'listening'
          ? 'listening'
          : (recorderState === 'denied' || recorderState === 'unsupported') &&
              phase === 'idle'
            ? 'denied'
            : phase;

    // Closing the panel (or leaving the page) stops waiting for an answer nobody will read.
    useEffect(
        () => () => {
            waiting.current?.abort();
        },
        [],
    );

    const onMic = () => {
        if (voicePhase === 'idle' || voicePhase === 'error') {
            if (voice) {
                setVoiceMessage(null);
                setVoiceNote(null);
                void recorder.start();
            } else {
                setPhase('listening');
            }
        } else if (voicePhase === 'listening') {
            if (voice) {
                recorder.stop();
            } else {
                void runInterpret(t('booking.sampleTranscript'));
            }
        }
    };

    useShortcut(
        'm',
        onMic,
        enableShortcuts && activeTab === 'voice' && voiceAvailable,
    );

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

    // Picking a time settles the "check the time" warning, whichever control picked it.
    const patchDraft = (patch: Partial<ReviewDraft>) =>
        setDraft((d) =>
            d
                ? {
                      ...d,
                      ...patch,
                      ...(patch.startsAt && !patch.lowConfidence
                          ? {
                                lowConfidence: d.lowConfidence.filter(
                                    (c) => c !== 'time',
                                ),
                            }
                          : {}),
                  }
                : d,
        );

    const resetVoice = () => {
        waiting.current?.abort();
        recorder.cancel();
        hold.clear();
        setDraft(null);
        setPhase('idle');
        setError('');
        setVoiceMessage(null);
    };

    const confirmVoice = async () => {
        if (!draft || !effectiveStart || hold.expired) {
            return;
        }

        setSaving(true);

        try {
            // The server matched a patient (by phone, then name); otherwise the phone finds one, or this is a new patient.
            const patient = draft.patientId
                ? await source.patients.get(draft.patientId)
                : ((await source.patients.search(draft.phone, 1))[0] ??
                  (await source.patients.create({
                      name: draft.patientName,
                      phone: draft.phone,
                  })));
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
        setVoiceMessage(null);
        setVoiceNote(null);
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
            </div>
        );
    }

    const reviewDoctorOffered = offered(draft?.doctorId);

    return (
        <div className="flex flex-1 flex-col">
            <Tabs tab={activeTab} order={tabs} onChange={setChosenTab} />

            {activeTab === 'voice' && (
                <div
                    role="tabpanel"
                    id="booking-panel-voice"
                    aria-labelledby="booking-tab-voice"
                    className="flex flex-col gap-[18px] p-5"
                >
                    {!voiceAvailable && (
                        <p
                            role="status"
                            className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-subtle px-4 py-3.5 text-control text-ink"
                        >
                            <MicOff
                                aria-hidden="true"
                                className="mt-1 size-[18px] shrink-0 text-subtle"
                            />
                            {t('voice.off')}
                        </p>
                    )}
                    {voiceAvailable &&
                        (voicePhase === 'idle' ||
                            voicePhase === 'listening' ||
                            voicePhase === 'error' ||
                            voicePhase === 'denied') && (
                            <>
                                <VoiceCaptureButton
                                    state={voicePhase}
                                    onToggle={onMic}
                                    onTypeInstead={() =>
                                        document
                                            .getElementById('booking-typed')
                                            ?.focus()
                                    }
                                    errorMessage={
                                        voiceMessage &&
                                        voiceMessage !== 'unclear'
                                            ? t(VOICE_MESSAGE[voiceMessage])
                                            : undefined
                                    }
                                    deniedMessage={
                                        recorderState === 'unsupported'
                                            ? t('voice.unsupportedBody')
                                            : undefined
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
                                            ) && <CheckBadge />}
                                            <input
                                                {...control}
                                                type="text"
                                                value={draft.patientName}
                                                onChange={(event) =>
                                                    patchDraft({
                                                        patientName:
                                                            event.target.value,
                                                        // Typing a different name makes this a different person than the one matched.
                                                        patientId: null,
                                                        lowConfidence:
                                                            draft.lowConfidence.filter(
                                                                (c) =>
                                                                    c !==
                                                                    'patient',
                                                            ),
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
                                        patchDraft({ phone, patientId: null })
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
                                    {draft.lowConfidence.includes('doctor') && (
                                        <CheckBadge />
                                    )}
                                    <div
                                        className={cn(
                                            'flex flex-wrap gap-2',
                                            draft.lowConfidence.includes(
                                                'doctor',
                                            ) &&
                                                'rounded-md border-2 border-warning-accent p-2',
                                        )}
                                    >
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
                                                        // Choosing the doctor settles the service that goes with them too.
                                                        lowConfidence:
                                                            draft.lowConfidence.filter(
                                                                (c) =>
                                                                    c !==
                                                                        'doctor' &&
                                                                    c !==
                                                                        'service',
                                                            ),
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
                                    {draft.lowConfidence.includes(
                                        'service',
                                    ) && <CheckBadge />}
                                    <div
                                        className={cn(
                                            'flex flex-wrap gap-2',
                                            draft.lowConfidence.includes(
                                                'service',
                                            ) &&
                                                'rounded-md border-2 border-warning-accent p-2',
                                        )}
                                    >
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
                                                        lowConfidence:
                                                            draft.lowConfidence.filter(
                                                                (c) =>
                                                                    c !==
                                                                    'service',
                                                            ),
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
                                    {draft.lowConfidence.includes('time') && (
                                        <CheckBadge />
                                    )}
                                    <div
                                        className={cn(
                                            'flex items-center gap-2.5',
                                            draft.lowConfidence.includes(
                                                'time',
                                            ) &&
                                                'w-fit rounded-md border-2 border-warning-accent p-2',
                                        )}
                                    >
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

            {activeTab === 'manual' && (
                <div
                    role="tabpanel"
                    id="booking-panel-manual"
                    aria-labelledby="booking-tab-manual"
                    className="flex flex-col gap-[18px] p-5"
                >
                    {voiceNote && (
                        <p
                            role="status"
                            className="flex items-start gap-2.5 rounded-lg border border-warning-line bg-warning-surface px-3.5 py-3 text-control text-warning-ink"
                        >
                            <TriangleAlert
                                aria-hidden="true"
                                className="mt-1 size-[18px] shrink-0"
                            />
                            {t('booking.voicePartial', { heard: voiceNote })}
                        </p>
                    )}
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
                        {mOffered.length === 0 && (
                            <p role="status" className="text-control">
                                {t('booking.noServices')}
                            </p>
                        )}
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
                        {mOffered.length === 0 ? (
                            <p className="text-control">
                                {t('booking.noSlots')}
                            </p>
                        ) : (
                            <SlotPicker
                                slots={mSlots.value}
                                loading={mSlots.loading}
                                selected={manual.slotStart}
                                timeZone={tz}
                                onSelect={pickManualSlot}
                            />
                        )}
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
        </div>
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
