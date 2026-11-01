import { useSyncExternalStore } from 'react';
import { openLiveChannel, type LiveLine } from '@/lib/live-echo';

/**
 * Live updates, from the screen's side. The server announces "something changed" on the clinic's private channel
 * (App\Live\LiveUpdate: a topic and an id, never patient data); a page that shows that kind of data reads it again
 * through its normal, checked route. This module keeps the one connection and tells the pages.
 *
 * Without VITE_REVERB_APP_KEY (or without real sign-in) nothing connects and every page keeps refreshing on its timer.
 */
export type LiveTopic =
    | 'appointments'
    | 'requests'
    | 'messages'
    | 'slots'
    | 'directory'
    | 'audit';

/** `off`: no live connection is wanted. `down`: wanted, but the line is not up (the pages go back to refreshing on a timer). */
export type LiveStatus = 'off' | 'connecting' | 'connected' | 'down';

const REAL_AUTH = import.meta.env.VITE_REAL_AUTH === 'true';

/** Whether this build can open a live connection at all. */
export const liveConfigured = (): boolean =>
    REAL_AUTH && !!import.meta.env.VITE_REVERB_APP_KEY;

type TopicListener = { topics: readonly LiveTopic[]; run: () => void };

const topicListeners = new Set<TopicListener>();
const statusListeners = new Set<() => void>();
let status: LiveStatus = 'off';

export function setLiveStatus(next: LiveStatus) {
    if (next === status) {
        return;
    }

    status = next;
    statusListeners.forEach((listener) => listener());
}

/** Tell every page that shows this topic. The server's announcement arrives here; tests call it directly. */
export function emitLive(topic: string) {
    topicListeners.forEach((listener) => {
        if ((listener.topics as readonly string[]).includes(topic)) {
            listener.run();
        }
    });
}

/** Run `run` when any of `topics` changes. Returns what stops it. */
export function subscribeLive(
    topics: readonly LiveTopic[],
    run: () => void,
): () => void {
    const listener = { topics, run };
    topicListeners.add(listener);

    return () => {
        topicListeners.delete(listener);
    };
}

export function useLiveStatus(): LiveStatus {
    return useSyncExternalStore(
        (notify) => {
            statusListeners.add(notify);

            return () => {
                statusListeners.delete(notify);
            };
        },
        () => status,
        () => 'off',
    );
}

const xsrfHeaders = (): Record<string, string> => {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(match ? { 'X-XSRF-TOKEN': decodeURIComponent(match[1]) } : {}),
    };
};

let open: { channel: string; close: () => void } | null = null;
let users = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

const lineToStatus: Record<LiveLine, LiveStatus> = {
    connecting: 'connecting',
    connected: 'connected',
    down: 'down',
};

/**
 * Keep the live line open for `channel` while a staff screen is on. Layouts come and go as the person moves between
 * pages, so the line is shared, and closed only once nobody has wanted it for a couple of seconds.
 */
export function connectLive(channel: string): () => void {
    users += 1;
    clearTimeout(closeTimer);

    if (open !== null && open.channel !== channel) {
        open.close();
        open = null;
    }

    if (open === null) {
        const scheme = import.meta.env.VITE_REVERB_SCHEME ?? 'https';
        const secure = scheme === 'https';
        const close = openLiveChannel(
            channel,
            {
                key: import.meta.env.VITE_REVERB_APP_KEY ?? '',
                host: import.meta.env.VITE_REVERB_HOST ?? window.location.hostname,
                port: Number(
                    import.meta.env.VITE_REVERB_PORT ?? (secure ? 443 : 80),
                ),
                secure,
                headers: xsrfHeaders,
            },
            {
                onUpdate: emitLive,
                onLine: (line) => setLiveStatus(lineToStatus[line]),
            },
        );

        open = { channel, close };
        setLiveStatus('connecting');
    }

    return () => {
        users -= 1;

        if (users > 0) {
            return;
        }

        closeTimer = setTimeout(() => {
            open?.close();
            open = null;
            setLiveStatus('off');
        }, 2000);
    };
}
