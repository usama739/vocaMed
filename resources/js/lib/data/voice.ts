import { DataError, type Id, type IsoDateTime } from './types';

/** Where a voice request is on its way from a recording (or typed text) to a draft booking. */
export type VoiceStatus =
    'queued' | 'transcribing' | 'parsing' | 'ready' | 'failed';

/** The fields of the review card the server was unsure of, or could not find at all. */
export type VoiceCheck = 'patient' | 'doctor' | 'service' | 'time';

/**
 * A request resolved to this clinic's real records (`draft` of `GET /api/voice/{id}`). A field that could not be found is null
 * (empty for the patient's name and phone) and is always listed in `lowConfidence`.
 */
export interface VoiceDraft {
    heard: string;
    /** The matched patient, or null for a new patient (the name and phone are what was heard). */
    patientId: Id | null;
    patientName: string;
    phone: string;
    doctorId: Id | null;
    serviceId: Id | null;
    startsAt: IsoDateTime | null;
    lowConfidence: VoiceCheck[];
}

export interface VoiceRequestView {
    id: Id;
    source: 'audio' | 'text';
    status: VoiceStatus;
    transcript: string | null;
    /** The words that were understood; `kind` is `unsupported` for anything but a new booking. */
    parsed: { kind: 'book' | 'unsupported' } | null;
    draft: VoiceDraft | null;
    /** Why it failed: `no_speech`, `rate_limited`, `unavailable`, `provider_auth`, `not_configured`, `unreadable`, ... */
    failureCode: string | null;
}

/**
 * The receptionist's voice requests. Both ways of asking answer at once with an id; `get` is then asked until the request is
 * `ready` or `failed` (see `waitForVoice`). Only the real source has this: the open demo's stand-in lives in the booking panel.
 */
export interface VoiceSource {
    /** `POST /api/voice/transcribe`: a recording of up to 15 seconds. */
    transcribe(audio: Blob, seconds: number): Promise<{ id: Id }>;
    /** `POST /api/voice/parse-text`: a request typed into the command box. */
    parseText(text: string): Promise<{ id: Id }>;
    /** `GET /api/voice/{id}`. */
    get(id: Id): Promise<VoiceRequestView>;
}

/** What the booking panel does with a finished request. */
export type VoiceOutcome =
    /** Everything needed to book was found: the review card. */
    | {
          kind: 'review';
          draft: VoiceDraft & {
              doctorId: Id;
              serviceId: Id;
              startsAt: IsoDateTime;
          };
      }
    /** Part of it was found: the Manual tab, filled in as far as it goes. */
    | { kind: 'partial'; draft: VoiceDraft }
    /** Asked to cancel, move or look something up: voice only books. */
    | { kind: 'notBooking' }
    /** Nothing usable: a short reason for the person (see `voice.*` copy). */
    | { kind: 'failed'; reason: VoiceFailure };

export type VoiceFailure =
    /** Silence, or a recording too short to hold words. */
    | 'noSpeech'
    /** The speech service is busy or used up for now; try again in a little while. */
    | 'busy'
    /** Voice is not set up on the server (no key, a refused key). Type the request instead. */
    | 'notSetUp'
    /** Anything else: the request could not be read. */
    | 'unclear'
    /** Voice is switched off for this clinic. */
    | 'off';

/** Turns what the server answered into what the panel does next. */
export function voiceOutcome(view: VoiceRequestView): VoiceOutcome {
    if (view.status === 'failed') {
        return { kind: 'failed', reason: failureOf(view.failureCode) };
    }

    if (view.parsed?.kind === 'unsupported') {
        return { kind: 'notBooking' };
    }

    const draft = view.draft;

    if (!draft) {
        return { kind: 'failed', reason: 'unclear' };
    }

    if (draft.doctorId && draft.serviceId && draft.startsAt) {
        return {
            kind: 'review',
            draft: {
                ...draft,
                doctorId: draft.doctorId,
                serviceId: draft.serviceId,
                startsAt: draft.startsAt,
            },
        };
    }

    return { kind: 'partial', draft };
}

/** The reason a request failed, as one of the few messages a person can act on. */
export function failureOf(code: string | null): VoiceFailure {
    switch (code) {
        case 'no_speech':
            return 'noSpeech';
        case 'rate_limited':
            return 'busy';
        case 'provider_auth':
        case 'not_configured':
            return 'notSetUp';
        default:
            return 'unclear';
    }
}

/** The reason a call to the voice endpoints was refused, for the same messages. */
export function failureOfError(error: unknown): VoiceFailure {
    if (error instanceof DataError) {
        if (error.code === 'VOICE_OFF') {
            return 'off';
        }

        if (error.code === 'RATE_LIMITED') {
            return 'busy';
        }
    }

    return 'unclear';
}

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks for a request until it is `ready` or `failed`: every 700 ms by default, for up to 20 seconds, then gives up with
 * `VOICE_TIMEOUT` (the panel then offers the typed box). A request that is not found, or an answer that fails, ends the wait at once.
 * `signal` stops it when the person closes the panel or starts over.
 */
export async function waitForVoice(
    source: VoiceSource,
    id: Id,
    options: {
        intervalMs?: number;
        timeoutMs?: number;
        signal?: AbortSignal;
        sleep?: (ms: number) => Promise<void>;
    } = {},
): Promise<VoiceRequestView> {
    const intervalMs = options.intervalMs ?? 700;
    const timeoutMs = options.timeoutMs ?? 20_000;
    const sleep = options.sleep ?? defaultSleep;
    let waited = 0;

    for (;;) {
        if (options.signal?.aborted) {
            throw new DataError('VOICE_TIMEOUT', 'Stopped waiting');
        }

        const view = await source.get(id);

        if (view.status === 'ready' || view.status === 'failed') {
            return view;
        }

        if (waited >= timeoutMs) {
            throw new DataError('VOICE_TIMEOUT', 'Took too long');
        }

        await sleep(intervalMs);
        waited += intervalMs;
    }
}
