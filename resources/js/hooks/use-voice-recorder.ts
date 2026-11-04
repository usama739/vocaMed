import { useCallback, useEffect, useRef, useState } from 'react';

/** A recording is cut off here; the server refuses anything longer (and a free speech tier bills by the second). */
export const MAX_RECORDING_SECONDS = 15;

/** Below this the recording holds no words; it is not sent. */
export const MIN_RECORDING_SECONDS = 0.6;

/** What a browser's recorder can make, best first: Chrome and Firefox give webm or ogg, Safari mp4. The server accepts all of them. */
const TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
];

export type RecorderState = 'idle' | 'listening' | 'denied' | 'unsupported';

export type Recording = { blob: Blob; seconds: number };

/**
 * Whether this browser can record at all: it needs a microphone API and a recorder, and the page must be on localhost or HTTPS (a
 * browser refuses the microphone on any other address).
 */
export function canRecord(): boolean {
    return (
        typeof window !== 'undefined' &&
        window.isSecureContext !== false &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined'
    );
}

/**
 * Records from the microphone until `stop()` is called or `MAX_RECORDING_SECONDS` pass, then hands the recording to `onRecorded`.
 * It asks for the microphone only when `start()` is called, lets go of it as soon as the recording ends (so the browser's recording
 * light goes off), and cancels quietly if the screen closes mid-recording. `denied` means the person (or the browser) said no.
 */
export function useVoiceRecorder({
    onRecorded,
    onError,
}: {
    onRecorded: (recording: Recording) => void;
    onError?: () => void;
}) {
    const [state, setState] = useState<RecorderState>(() =>
        canRecord() ? 'idle' : 'unsupported',
    );
    const recorder = useRef<MediaRecorder | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startedAt = useRef(0);
    const discard = useRef(false);
    const mounted = useRef(true);
    const latest = useRef({ onRecorded, onError });

    useEffect(() => {
        latest.current = { onRecorded, onError };
    });

    const release = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }

        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
    }, []);

    const stop = useCallback(() => {
        if (recorder.current?.state === 'recording') {
            recorder.current.stop();
        }
    }, []);

    const start = useCallback(async () => {
        if (recorder.current) {
            return;
        }

        if (!canRecord()) {
            setState('unsupported');

            return;
        }

        let granted: MediaStream;

        try {
            granted = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
        } catch {
            if (mounted.current) {
                setState('denied');
            }

            return;
        }

        // The screen was closed while the browser was asking: do not keep the microphone.
        if (!mounted.current) {
            granted.getTracks().forEach((track) => track.stop());

            return;
        }

        const type = TYPES.find((candidate) =>
            MediaRecorder.isTypeSupported(candidate),
        );
        const chunks: Blob[] = [];
        const created = new MediaRecorder(
            granted,
            type ? { mimeType: type } : undefined,
        );

        created.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        created.onerror = () => {
            release();

            if (mounted.current) {
                setState('idle');
                latest.current.onError?.();
            }
        };
        created.onstop = () => {
            const seconds = Math.min(
                MAX_RECORDING_SECONDS,
                (performance.now() - startedAt.current) / 1000,
            );
            const wasDiscarded = discard.current;
            const mime = created.mimeType || type || 'audio/webm';

            release();

            if (!mounted.current) {
                return;
            }

            setState('idle');

            if (!wasDiscarded) {
                latest.current.onRecorded({
                    blob: new Blob(chunks, { type: mime }),
                    seconds,
                });
            }
        };

        discard.current = false;
        stream.current = granted;
        recorder.current = created;
        startedAt.current = performance.now();
        created.start();
        timer.current = setTimeout(stop, MAX_RECORDING_SECONDS * 1000);
        setState('listening');
    }, [release, stop]);

    /** Stops without sending anything (the person started over, or closed the panel). */
    const cancel = useCallback(() => {
        discard.current = true;

        if (recorder.current?.state === 'recording') {
            recorder.current.stop();
        } else {
            release();
        }
    }, [release]);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            discard.current = true;

            if (recorder.current?.state === 'recording') {
                recorder.current.stop();
            }

            release();
        };
    }, [release]);

    return { state, start, stop, cancel };
}
