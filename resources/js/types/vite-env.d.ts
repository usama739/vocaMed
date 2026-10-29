/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** "true" sends sign-in, recovery, invitations and sign-up to Laravel instead of the mock. */
    readonly VITE_REAL_AUTH?: string;
}
