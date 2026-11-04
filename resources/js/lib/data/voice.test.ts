import { describe, expect, it, vi } from 'vitest';
import {
    failureOf,
    failureOfError,
    voiceOutcome,
    waitForVoice,
    type VoiceDraft,
    type VoiceRequestView,
    type VoiceSource,
} from './voice';
import { DataError } from './types';

const draft = (overrides: Partial<VoiceDraft> = {}): VoiceDraft => ({
    heard: 'Ayesha with Dr. Sana tomorrow at ten',
    patientId: 'p1',
    patientName: 'Ayesha Khan',
    phone: '+923001234567',
    doctorId: 'd1',
    serviceId: 's1',
    startsAt: '2026-11-02T05:00:00.000Z',
    lowConfidence: [],
    ...overrides,
});

const view = (overrides: Partial<VoiceRequestView> = {}): VoiceRequestView => ({
    id: 'v1',
    source: 'text',
    status: 'ready',
    transcript: 'Ayesha with Dr. Sana tomorrow at ten',
    parsed: { kind: 'book' },
    draft: draft(),
    failureCode: null,
    ...overrides,
});

describe('voiceOutcome', () => {
    it('is a review when the doctor, the service and a time were all found', () => {
        const outcome = voiceOutcome(
            view({ draft: draft({ lowConfidence: ['time'] }) }),
        );

        expect(outcome.kind).toBe('review');

        if (outcome.kind === 'review') {
            expect(outcome.draft.doctorId).toBe('d1');
            expect(outcome.draft.lowConfidence).toEqual(['time']);
        }
    });

    it.each([
        ['doctor', { doctorId: null }],
        ['service', { serviceId: null }],
        ['time', { startsAt: null }],
    ])('is partial when the %s could not be found', (_, missing) => {
        expect(
            voiceOutcome(view({ draft: draft(missing as Partial<VoiceDraft>) }))
                .kind,
        ).toBe('partial');
    });

    it('says a request to cancel or move is not a booking, even though the server answered ready', () => {
        expect(
            voiceOutcome(
                view({ parsed: { kind: 'unsupported' }, draft: null }),
            ),
        ).toEqual({ kind: 'notBooking' });
    });

    it('maps each failure the server reports to a message a person can act on', () => {
        const failed = (code: string | null) =>
            voiceOutcome(
                view({ status: 'failed', draft: null, failureCode: code }),
            );

        expect(failed('no_speech')).toEqual({
            kind: 'failed',
            reason: 'noSpeech',
        });
        expect(failed('rate_limited')).toEqual({
            kind: 'failed',
            reason: 'busy',
        });
        expect(failed('provider_auth')).toEqual({
            kind: 'failed',
            reason: 'notSetUp',
        });
        expect(failed('not_configured')).toEqual({
            kind: 'failed',
            reason: 'notSetUp',
        });
        expect(failed('unreadable')).toEqual({
            kind: 'failed',
            reason: 'unclear',
        });
        expect(failed('audio_missing')).toEqual({
            kind: 'failed',
            reason: 'unclear',
        });
        expect(failed(null)).toEqual({ kind: 'failed', reason: 'unclear' });
    });

    it('is unclear when a ready request has no draft at all', () => {
        expect(voiceOutcome(view({ draft: null }))).toEqual({
            kind: 'failed',
            reason: 'unclear',
        });
    });
});

describe('failure messages', () => {
    it('reads the failure code of a request', () => {
        expect(failureOf('no_speech')).toBe('noSpeech');
        expect(failureOf('anything else')).toBe('unclear');
    });

    it('reads a refused call: voice switched off, or too many tries', () => {
        expect(failureOfError(new DataError('VOICE_OFF', 'off'))).toBe('off');
        expect(failureOfError(new DataError('RATE_LIMITED', 'slow'))).toBe(
            'busy',
        );
        expect(failureOfError(new DataError('FORBIDDEN', 'no'))).toBe(
            'unclear',
        );
        expect(failureOfError(new Error('network'))).toBe('unclear');
    });
});

function sourceAnswering(...views: VoiceRequestView[]): VoiceSource & {
    get: ReturnType<typeof vi.fn>;
} {
    const queue = [...views];

    return {
        transcribe: vi.fn(),
        parseText: vi.fn(),
        get: vi.fn(async () =>
            queue.length > 1 ? (queue.shift() as VoiceRequestView) : queue[0],
        ),
    };
}

describe('waitForVoice', () => {
    it('asks again until the request is ready, pausing between asks', async () => {
        const source = sourceAnswering(
            view({ status: 'queued', draft: null }),
            view({ status: 'parsing', draft: null }),
            view(),
        );
        const sleep = vi.fn(() => Promise.resolve());

        const result = await waitForVoice(source, 'v1', { sleep });

        expect(result.status).toBe('ready');
        expect(source.get).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(700);
    });

    it('does not wait at all when the first answer is final', async () => {
        const sleep = vi.fn(() => Promise.resolve());

        await waitForVoice(sourceAnswering(view()), 'v1', { sleep });

        expect(sleep).not.toHaveBeenCalled();
    });

    it('hands back a failed request for the caller to explain', async () => {
        const failed = view({
            status: 'failed',
            draft: null,
            failureCode: 'no_speech',
        });

        expect(await waitForVoice(sourceAnswering(failed), 'v1')).toBe(failed);
    });

    it('gives up after 20 seconds with VOICE_TIMEOUT', async () => {
        const source = sourceAnswering(
            view({ status: 'transcribing', draft: null }),
        );
        const sleep = vi.fn(() => Promise.resolve());

        await expect(
            waitForVoice(source, 'v1', { sleep }),
        ).rejects.toMatchObject({
            code: 'VOICE_TIMEOUT',
        });
        // 700 ms at a time for 20 s is 29 waits, and one more ask that finds the time is up.
        expect(sleep).toHaveBeenCalledTimes(29);
        expect(source.get).toHaveBeenCalledTimes(30);
    });

    it('stops at once when the screen asks it to', async () => {
        const controller = new AbortController();
        const source = sourceAnswering(view({ status: 'queued', draft: null }));
        const sleep = vi.fn(async () => controller.abort());

        await expect(
            waitForVoice(source, 'v1', { sleep, signal: controller.signal }),
        ).rejects.toMatchObject({ code: 'VOICE_TIMEOUT' });
        // It asked once, was told to stop while it waited, and did not ask again.
        expect(source.get).toHaveBeenCalledTimes(1);
    });

    it('lets a failed ask end the wait instead of retrying forever', async () => {
        const source: VoiceSource = {
            transcribe: vi.fn(),
            parseText: vi.fn(),
            get: vi.fn().mockRejectedValue(new DataError('NOT_FOUND', 'gone')),
        };

        await expect(
            waitForVoice(source, 'v1', { sleep: () => Promise.resolve() }),
        ).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        expect(source.get).toHaveBeenCalledTimes(1);
    });
});
