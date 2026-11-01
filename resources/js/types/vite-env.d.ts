/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** "true" sends sign-in, recovery, invitations and sign-up to Laravel instead of the mock. */
    readonly VITE_REAL_AUTH?: string;
    /** Reverb's public key. Set, with the host and port, to switch live updates on (see docs/backend/m9-live-updates.md). */
    readonly VITE_REVERB_APP_KEY?: string;
    readonly VITE_REVERB_HOST?: string;
    readonly VITE_REVERB_PORT?: string;
    readonly VITE_REVERB_SCHEME?: string;
}
