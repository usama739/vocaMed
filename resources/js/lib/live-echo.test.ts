import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload?: unknown) => void;

/** Stands in for pusher-js: records what the app asks of it, and lets the test play the server's part. */
const fake = vi.hoisted(() => {
    const state = {
        options: null as Record<string, unknown> | null,
        key: '',
        subscribed: [] as string[],
        connectionHandlers: {} as Record<string, Handler>,
        channelHandlers: {} as Record<string, Handler>,
        connectionState: 'connecting',
        disconnected: 0,
    };

    class FakePusher {
        connection = {
            get state() {
                return state.connectionState;
            },
            bind: (event: string, handler: Handler) => {
                state.connectionHandlers[event] = handler;
            },
        };

        constructor(key: string, options: Record<string, unknown>) {
            state.key = key;
            state.options = options;
        }

        subscribe(name: string) {
            state.subscribed.push(name);

            return {
                bind: (event: string, handler: Handler) => {
                    state.channelHandlers[event] = handler;
                },
                unbind: () => undefined,
            };
        }

        unsubscribe() {}

        disconnect() {
            state.disconnected += 1;
        }
    }

    return { state, FakePusher };
});

vi.mock('pusher-js', () => ({ default: fake.FakePusher }));

import { openLiveChannel } from './live-echo';

const settings = {
    key: 'public-key',
    host: 'localhost',
    port: 8080,
    secure: false,
    headers: () => ({ 'X-XSRF-TOKEN': 'abc' }),
};

describe('openLiveChannel', () => {
    beforeEach(() => {
        fake.state.subscribed = [];
        fake.state.connectionHandlers = {};
        fake.state.channelHandlers = {};
        fake.state.connectionState = 'connecting';
        fake.state.disconnected = 0;
    });

    it('opens the private channel with the key, the host and the session-proved authorisation', () => {
        openLiveChannel('clinic.c1', settings, {
            onUpdate: vi.fn(),
            onLine: vi.fn(),
        });

        expect(fake.state.key).toBe('public-key');
        expect(fake.state.options).toMatchObject({
            wsHost: 'localhost',
            wsPort: 8080,
            forceTLS: false,
        });
        expect(
            (
                fake.state.options?.channelAuthorization as {
                    endpoint: string;
                    headersProvider: () => Record<string, string>;
                }
            ).endpoint,
        ).toBe('/broadcasting/auth');
        expect(
            (
                fake.state.options?.channelAuthorization as {
                    headersProvider: () => Record<string, string>;
                }
            ).headersProvider(),
        ).toEqual({ 'X-XSRF-TOKEN': 'abc' });
        expect(fake.state.subscribed).toEqual(['private-clinic.c1']);
    });

    it('hands the topic of each announcement to the page, and nothing else', () => {
        const onUpdate = vi.fn();

        openLiveChannel('clinic.c1', settings, { onUpdate, onLine: vi.fn() });

        fake.state.channelHandlers['live']?.({ topic: 'appointments', id: 'a1' });
        fake.state.channelHandlers['live']?.({ nothing: true });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith('appointments');
    });

    it('reports the line: connecting, then connected, then down when it drops or the channel is refused', () => {
        const onLine = vi.fn();

        openLiveChannel('clinic.c1', settings, { onUpdate: vi.fn(), onLine });
        expect(onLine).toHaveBeenLastCalledWith('connecting');

        fake.state.connectionHandlers['state_change']?.({ current: 'connected' });
        expect(onLine).toHaveBeenLastCalledWith('connected');

        fake.state.connectionHandlers['state_change']?.({ current: 'unavailable' });
        expect(onLine).toHaveBeenLastCalledWith('down');

        fake.state.connectionHandlers['state_change']?.({ current: 'connected' });
        fake.state.channelHandlers['pusher:subscription_error']?.({ status: 403 });
        expect(onLine).toHaveBeenLastCalledWith('down');
    });

    it('disconnects when closed', () => {
        const close = openLiveChannel('clinic.c1', settings, {
            onUpdate: vi.fn(),
            onLine: vi.fn(),
        });

        close();

        expect(fake.state.disconnected).toBe(1);
    });
});
