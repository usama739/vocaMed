import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_RECORDING_SECONDS,
    useVoiceRecorder,
    type Recording,
} from './use-voice-recorder';

/** A recorder that records nothing but behaves like the browser's: start, stop, then data and stop events. */
class FakeRecorder {
    static instances: FakeRecorder[] = [];
    static supported = true;
    static isTypeSupported = (type: string) =>
        FakeRecorder.supported && type.startsWith('audio/webm');

    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(
        readonly stream: unknown,
        options?: { mimeType?: string },
    ) {
        this.mimeType = options?.mimeType ?? '';
        FakeRecorder.instances.push(this);
    }

    start() {
        this.state = 'recording';
    }

    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({
            data: new Blob(['audio'], { type: this.mimeType }),
        });
        this.onstop?.();
    }
}

const track = () => ({ stop: vi.fn() });
let tracks: ReturnType<typeof track>[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;
let now = 0;

beforeEach(() => {
    FakeRecorder.instances = [];
    FakeRecorder.supported = true;
    tracks = [track()];
    getUserMedia = vi.fn(async () => ({ getTracks: () => tracks }));
    now = 1000;
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: { getUserMedia },
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup() {
    const onRecorded = vi.fn<(recording: Recording) => void>();
    const onError = vi.fn();
    const hook = renderHook(() => useVoiceRecorder({ onRecorded, onError }));

    return { ...hook, onRecorded, onError };
}

describe('useVoiceRecorder', () => {
    it('asks for the microphone only when started, listens, then hands over the recording and its length', async () => {
        const { result, onRecorded } = setup();

        expect(result.current.state).toBe('idle');
        expect(getUserMedia).not.toHaveBeenCalled();

        await act(() => result.current.start());

        expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
        expect(result.current.state).toBe('listening');

        now = 4200;
        act(() => result.current.stop());

        expect(result.current.state).toBe('idle');
        expect(onRecorded).toHaveBeenCalledTimes(1);

        const { blob, seconds } = onRecorded.mock.calls[0][0];

        expect(seconds).toBeCloseTo(3.2, 5);
        expect(blob.type).toBe('audio/webm;codecs=opus');
        expect(blob.size).toBeGreaterThan(0);
    });

    it('lets go of the microphone as soon as the recording ends, so the browser light goes off', async () => {
        const { result } = setup();

        await act(() => result.current.start());
        expect(tracks[0].stop).not.toHaveBeenCalled();

        act(() => result.current.stop());

        expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    });

    it('prefers webm, and records in whatever the browser has when it knows none of them', async () => {
        FakeRecorder.supported = false;
        const { result, onRecorded } = setup();

        await act(() => result.current.start());
        act(() => result.current.stop());

        expect(FakeRecorder.instances[0].mimeType).toBe('');
        expect(onRecorded.mock.calls[0][0].blob.type).toBe('audio/webm');
    });

    it('stops by itself after 15 seconds and never reports more', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { result, onRecorded } = setup();

        await act(() => result.current.start());
        now = 1000 + 40_000;

        act(() => vi.advanceTimersByTime(MAX_RECORDING_SECONDS * 1000));

        expect(onRecorded).toHaveBeenCalledTimes(1);
        expect(onRecorded.mock.calls[0][0].seconds).toBe(MAX_RECORDING_SECONDS);
        expect(result.current.state).toBe('idle');
    });

    it('does not start twice', async () => {
        const { result } = setup();

        await act(() => result.current.start());
        await act(() => result.current.start());

        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(FakeRecorder.instances).toHaveLength(1);
    });

    it('is denied when the person (or the browser) says no, and sends nothing', async () => {
        getUserMedia.mockRejectedValue(
            new DOMException('no', 'NotAllowedError'),
        );
        const { result, onRecorded } = setup();

        await act(() => result.current.start());

        expect(result.current.state).toBe('denied');
        expect(FakeRecorder.instances).toHaveLength(0);
        expect(onRecorded).not.toHaveBeenCalled();
    });

    it('is unsupported, without asking for anything, where the browser cannot record', async () => {
        vi.stubGlobal('MediaRecorder', undefined);
        const { result } = setup();

        expect(result.current.state).toBe('unsupported');

        await act(() => result.current.start());

        expect(getUserMedia).not.toHaveBeenCalled();
        expect(result.current.state).toBe('unsupported');
    });

    it('is unsupported on an address a browser will not give the microphone to', () => {
        vi.stubGlobal('isSecureContext', false);

        expect(setup().result.current.state).toBe('unsupported');
    });

    it('throws a cancelled recording away', async () => {
        const { result, onRecorded } = setup();

        await act(() => result.current.start());
        act(() => result.current.cancel());

        expect(onRecorded).not.toHaveBeenCalled();
        expect(tracks[0].stop).toHaveBeenCalled();
        expect(result.current.state).toBe('idle');
    });

    it('stops quietly, sending nothing, when the screen closes mid-recording', async () => {
        const { result, onRecorded, unmount } = setup();

        await act(() => result.current.start());
        unmount();

        expect(onRecorded).not.toHaveBeenCalled();
        expect(tracks[0].stop).toHaveBeenCalled();
    });

    it('does not keep the microphone if the screen closed while the browser was still asking', async () => {
        let grant: (stream: unknown) => void = () => {};
        getUserMedia.mockReturnValue(
            new Promise((resolve) => (grant = resolve)),
        );
        const { result, unmount } = setup();

        let started: Promise<void> | undefined;
        act(() => {
            started = result.current.start();
        });
        unmount();
        grant({ getTracks: () => tracks });
        await started;

        expect(FakeRecorder.instances).toHaveLength(0);
        expect(tracks[0].stop).toHaveBeenCalled();
    });

    it('reports a recorder that fails and lets go of the microphone', async () => {
        const { result, onError, onRecorded } = setup();

        await act(() => result.current.start());
        act(() => FakeRecorder.instances[0].onerror?.());

        await waitFor(() => expect(result.current.state).toBe('idle'));
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onRecorded).not.toHaveBeenCalled();
        expect(tracks[0].stop).toHaveBeenCalled();
    });
});
