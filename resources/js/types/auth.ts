import type { SessionUser } from '@/lib/data';

/** The `auth` prop every page receives (HandleInertiaRequests::share). Null when nobody is signed in. */
export type Auth = {
    user: SessionUser | null;
    clinic: { name: string } | null;
    /** The private channel this person's screens listen on for live updates; null when there is none. */
    liveChannel?: string | null;
};
