import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/** What the screens need from the socket: "something changed" and whether the line is up. Nothing else crosses it. */
export type LiveLine = 'connecting' | 'connected' | 'down';

export type LiveSettings = {
    /** Reverb's public key (VITE_REVERB_APP_KEY). */
    key: string;
    host: string;
    port: number;
    secure: boolean;
    /** Where the browser proves it may listen. Same site, so the session cookie does the proving. */
    authEndpoint?: string;
    /** Sent with every authorisation request (the CSRF token, read fresh each time). */
    headers: () => Record<string, string>;
};

export type LiveHandlers = {
    /** A change happened in this clinic: the topic says what kind (see App\Live\LiveTopic). */
    onUpdate: (topic: string) => void;
    onLine: (line: LiveLine) => void;
};

/**
 * Opens one private channel on Reverb through Laravel Echo. Kept apart from React so it can be run (and checked
 * against a real Reverb) without a browser. Returns what closes it.
 */
export function openLiveChannel(
    channel: string,
    settings: LiveSettings,
    handlers: LiveHandlers,
): () => void {
    const echo = new Echo({
        broadcaster: 'reverb',
        Pusher,
        key: settings.key,
        wsHost: settings.host,
        wsPort: settings.port,
        wssPort: settings.port,
        forceTLS: settings.secure,
        enabledTransports: ['ws', 'wss'],
        channelAuthorization: {
            transport: 'ajax',
            endpoint: settings.authEndpoint ?? '/broadcasting/auth',
            headersProvider: settings.headers,
        },
    });

    const pusher = echo.connector.pusher;

    const line = (state: string): LiveLine =>
        state === 'connected'
            ? 'connected'
            : state === 'connecting' || state === 'initialized'
              ? 'connecting'
              : 'down';

    pusher.connection.bind('state_change', ({ current }: { current: string }) =>
        handlers.onLine(line(current)),
    );
    handlers.onLine(line(pusher.connection.state));

    echo.private(channel)
        .listen('.live', (event: { topic?: string }) => {
            if (typeof event.topic === 'string') {
                handlers.onUpdate(event.topic);
            }
        })
        // The server refused this person the channel (or could not be asked): the line is as good as down.
        .error(() => handlers.onLine('down'));

    return () => {
        echo.leave(channel);
        echo.disconnect();
    };
}
