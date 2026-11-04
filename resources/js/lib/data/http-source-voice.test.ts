import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpSource } from './http-source';
import type { DataSource } from './source';
import { DataError } from './types';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown = {}) {
    const calls: Call[] = [];
    const impl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });

        return Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    }) as unknown as typeof fetch;

    return { impl, calls };
}

const mock = {
    clinicId: 'mock',
    clinic: { get: vi.fn(), settings: vi.fn() },
} as unknown as DataSource;

const desk = (status: number, body: unknown = {}) => {
    const { impl, calls } = fakeFetch(status, body);

    return { source: createHttpSource(mock, impl, { desk: true }), calls };
};

afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('the receptionist source · voice', () => {
    it('is only there for the front desk', () => {
        expect(
            createHttpSource(mock, vi.fn() as unknown as typeof fetch).voice,
        ).toBeUndefined();
        expect(
            createHttpSource(mock, vi.fn() as unknown as typeof fetch, {
                doctor: true,
            }).voice,
        ).toBeUndefined();
        expect(desk(200).source.voice).toBeDefined();
    });

    it('uploads a recording as one multipart request with its length and the session, and lets the browser set the content type', async () => {
        document.cookie = 'XSRF-TOKEN=abc%3D';
        const { source, calls } = desk(202, { id: 'v1', status: 'queued' });

        const result = await source.voice?.transcribe(
            new Blob(['audio-bytes'], { type: 'audio/webm;codecs=opus' }),
            4.2,
        );

        expect(result).toEqual({ id: 'v1' });
        expect(calls[0].url).toBe('/api/voice/transcribe');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.credentials).toBe('same-origin');

        const headers = calls[0].init.headers as Record<string, string>;

        expect(headers['X-XSRF-TOKEN']).toBe('abc=');
        expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(headers).not.toHaveProperty('Content-Type');

        const form = calls[0].init.body as FormData;
        const file = form.get('audio') as File;

        expect(form.get('durationSeconds')).toBe('4.2');
        expect(file.name).toBe('recording.webm');
        expect(await file.text()).toBe('audio-bytes');
    });

    it.each([
        ['audio/webm;codecs=opus', 'recording.webm'],
        ['audio/ogg;codecs=opus', 'recording.ogg'],
        ['audio/mp4', 'recording.m4a'],
    ])(
        'names a %s recording %s so the server knows its format',
        async (type, name) => {
            const { source, calls } = desk(202, { id: 'v1' });

            await source.voice?.transcribe(new Blob(['x'], { type }), 3);

            expect(
                ((calls[0].init.body as FormData).get('audio') as File).name,
            ).toBe(name);
        },
    );

    it('sends typed text as JSON', async () => {
        const { source, calls } = desk(202, { id: 'v2', status: 'queued' });

        expect(
            await source.voice?.parseText('Ayesha, Dr Sana, kal 3 baje'),
        ).toEqual({ id: 'v2' });
        expect(calls[0].url).toBe('/api/voice/parse-text');
        expect(JSON.parse(String(calls[0].init.body))).toEqual({
            text: 'Ayesha, Dr Sana, kal 3 baje',
        });
    });

    it('reads a request back by its id', async () => {
        const answer = {
            id: 'v 1',
            status: 'ready',
            draft: null,
            parsed: null,
            transcript: null,
            failureCode: null,
            source: 'text',
        };
        const { source, calls } = desk(200, answer);

        expect(await source.voice?.get('v 1')).toEqual(answer);
        expect(calls[0].url).toBe('/api/voice/v%201');
        expect(calls[0].init.method).toBe('GET');
    });

    it('turns a clinic with voice switched off into VOICE_OFF, for both ways of asking', async () => {
        const { source } = desk(403, {
            code: 'VOICE_OFF',
            message: 'off',
            field: null,
            detail: null,
        });

        await expect(source.voice?.parseText('x')).rejects.toMatchObject({
            code: 'VOICE_OFF',
        });
        await expect(
            source.voice?.transcribe(
                new Blob(['x'], { type: 'audio/webm' }),
                3,
            ),
        ).rejects.toBeInstanceOf(DataError);
    });

    it('turns "too many tries" (a busy minute or a used-up free tier) into RATE_LIMITED', async () => {
        const { source } = desk(429, {
            code: 'RATE_LIMITED',
            message: 'slow',
            retryAfter: 30,
        });

        await expect(source.voice?.parseText('x')).rejects.toMatchObject({
            code: 'RATE_LIMITED',
        });
    });

    it('turns a refused recording (too long, too large, not audio) into a validation error naming the field', async () => {
        const { source } = desk(422, {
            code: 'VALIDATION',
            message: 'bad',
            field: 'audio',
            errors: { audio: ['too large'] },
        });

        await expect(
            source.voice?.transcribe(
                new Blob(['x'], { type: 'audio/webm' }),
                3,
            ),
        ).rejects.toMatchObject({
            code: 'VALIDATION',
            field: 'audio',
        });
    });

    it('treats an answer that is not 202 with an id as a failure', async () => {
        const { source } = desk(202, { nothing: true });

        await expect(source.voice?.parseText('x')).rejects.toThrow();
    });
});
