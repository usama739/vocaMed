import { dataErrorFrom } from './http-source';
import { sendJson } from './http';
import type { PatientLinkSource } from './source';
import type {
    ExpiredLinkView,
    ManagePage,
    RescheduleOutcome,
    ReschedulePage,
    StatusPage,
} from './patient-views';
import type { AppointmentStatus, IsoDateTime } from './types';

/**
 * The patient link pages and actions against Laravel. The signed token in the address is the only credential: no sign-in, no
 * staff data. Each page reads the JSON of its own address; an expired or unknown link is a normal answer (`state: "expired"`), and
 * an action on a dead link is a 410 `LINK_EXPIRED`. Used when real sign-in is on; otherwise the sample links stay.
 */
export function createHttpPatientLinks(
    fetchImpl: typeof fetch = fetch,
): PatientLinkSource {
    const base = (token: string) => `/p/${encodeURIComponent(token)}`;

    async function read<T>(what: string, url: string): Promise<T> {
        const res = await sendJson('GET', url, undefined, fetchImpl);

        if (res.status === 200 && res.body) {
            return res.body as unknown as T;
        }

        throw dataErrorFrom(what, res);
    }

    async function act<T>(
        what: string,
        url: string,
        data?: Record<string, unknown>,
    ): Promise<T> {
        const res = await sendJson('POST', url, data, fetchImpl);

        if (res.status >= 200 && res.status < 300 && res.body) {
            return res.body as unknown as T;
        }

        throw dataErrorFrom(what, res);
    }

    return {
        views: {
            manage: (token) => read<ManagePage>('manage page', base(token)),
            reschedule: (token) =>
                read<ReschedulePage>(
                    'reschedule page',
                    `${base(token)}/reschedule`,
                ),
            status: (token) =>
                read<StatusPage>('status page', `${base(token)}/status`),
            expired: (token) =>
                read<ExpiredLinkView>('expired page', `${base(token)}/expired`),
        },

        confirm: (token) =>
            act<{ status: AppointmentStatus }>(
                'confirm',
                `${base(token)}/confirm`,
            ),
        cancel: (token) =>
            act<{ status: AppointmentStatus }>(
                'cancel',
                `${base(token)}/cancel`,
            ),
        reschedule: (token, startsAt: IsoDateTime) =>
            act<RescheduleOutcome>('reschedule', `${base(token)}/reschedule`, {
                startsAt,
            }),
        requestNewLink: async (token) => {
            await act('new link', `${base(token)}/request-link`);
        },

        /** Not used by any page: the pages read their own views, which carry only what a patient may see. */
        resolve: () =>
            Promise.reject(
                new Error('A link is opened through its page views only'),
            ),
    };
}
