import { describe, expect, it, vi } from 'vitest';
import manage from '../../../../tests/fixtures/patient-manage-view.json';
import expired from '../../../../tests/fixtures/patient-expired-view.json';
import reschedule from '../../../../tests/fixtures/patient-reschedule-view.json';
import status from '../../../../tests/fixtures/patient-status-view.json';
import slot from '../../../../tests/fixtures/slot.json';
import { createHttpPatientLinks } from './patient-http';
import { DataError } from './types';

type Call = { url: string; init: RequestInit };

/** A fetch that answers every request with one status and body, and remembers what it was asked. */
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

const links = (statusCode: number, body: unknown = {}) => {
    const { impl, calls } = fakeFetch(statusCode, body);

    return { source: createHttpPatientLinks(impl), calls };
};

const caught = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the call to fail');
};

describe('the real patient link source: what the pages read', () => {
    it('reads each page from its own address and hands the screen exactly what the server sent', async () => {
        const cases: [
            string,
            unknown,
            (s: ReturnType<typeof links>['source']) => Promise<unknown>,
        ][] = [
            ['/p/tok', manage, (s) => s.views.manage('tok')],
            ['/p/tok/reschedule', reschedule, (s) => s.views.reschedule('tok')],
            ['/p/tok/status', status, (s) => s.views.status('tok')],
            ['/p/tok/expired', expired, (s) => s.views.expired('tok')],
        ];

        for (const [url, fixture, read] of cases) {
            const { source, calls } = links(200, fixture);

            expect(await read(source)).toEqual(fixture);
            expect(calls[0].url).toBe(url);
            expect(calls[0].init.method).toBe('GET');
        }
    });

    it('encodes the token in the address and reads an expired link as a normal answer', async () => {
        const { source, calls } = links(200, {
            state: 'expired',
            clinic: null,
        });

        expect(await source.views.manage('a/b c')).toEqual({
            state: 'expired',
            clinic: null,
        });
        expect(calls[0].url).toBe('/p/a%2Fb%20c');
    });

    it('opens a link through its page views only', async () => {
        await expect(links(200).source.resolve('tok')).rejects.toThrow();
    });
});

describe('the real patient link source: what the patient does', () => {
    it('confirms, cancels and moves with the right method, address and body', async () => {
        const confirm = links(200, { status: 'confirmed' });
        expect(await confirm.source.confirm('tok')).toEqual({
            status: 'confirmed',
        });
        expect(confirm.calls[0]).toMatchObject({
            url: '/p/tok/confirm',
            init: { method: 'POST' },
        });

        const cancel = links(200, { status: 'cancelled' });
        expect(await cancel.source.cancel('tok')).toEqual({
            status: 'cancelled',
        });
        expect(cancel.calls[0].url).toBe('/p/tok/cancel');

        const move = links(200, {
            result: 'requested',
            startsAt: '2026-11-05T06:00:00.000Z',
        });
        expect(
            await move.source.reschedule('tok', '2026-11-05T06:00:00.000Z'),
        ).toEqual({
            result: 'requested',
            startsAt: '2026-11-05T06:00:00.000Z',
        });
        expect(move.calls[0]).toMatchObject({
            url: '/p/tok/reschedule',
            init: { method: 'POST' },
        });
        expect(JSON.parse(String(move.calls[0].init.body))).toEqual({
            startsAt: '2026-11-05T06:00:00.000Z',
        });
    });

    it('asks for a new link and always gets the same answer', async () => {
        const { source, calls } = links(200, { ok: true });

        await expect(source.requestNewLink('tok')).resolves.toBeUndefined();
        expect(calls[0]).toMatchObject({
            url: '/p/tok/request-link',
            init: { method: 'POST' },
        });
    });

    it('turns each refusal into the error the page has a state for', async () => {
        const taken = await caught(
            links(409, {
                code: 'SLOT_UNAVAILABLE',
                message: 'Gone',
                alternatives: [slot],
            }).source.reschedule('tok', '2026-11-05T06:00:00.000Z'),
        );
        expect(taken).toBeInstanceOf(DataError);
        expect(taken).toMatchObject({
            code: 'SLOT_UNAVAILABLE',
            alternatives: [slot],
        });

        expect(
            await caught(
                links(403, {
                    code: 'OUTSIDE_WINDOW',
                    message: 'Late',
                }).source.cancel('tok'),
            ),
        ).toMatchObject({ code: 'OUTSIDE_WINDOW' });
        expect(
            await caught(
                links(410, {
                    code: 'LINK_EXPIRED',
                    message: 'Gone',
                }).source.confirm('tok'),
            ),
        ).toMatchObject({ code: 'LINK_EXPIRED' });
        expect(
            await caught(
                links(422, {
                    code: 'INVALID_TRANSITION',
                    message: 'No',
                }).source.cancel('tok'),
            ),
        ).toMatchObject({ code: 'INVALID_TRANSITION' });
        expect(
            await caught(
                links(429, {
                    code: 'RATE_LIMITED',
                    message: 'Slow',
                }).source.requestNewLink('tok'),
            ),
        ).toMatchObject({ code: 'RATE_LIMITED' });
    });
});
