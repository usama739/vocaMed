export type HttpResult = {
    status: number;
    /** The parsed JSON body, or null when there is none or it is not JSON. */
    body: Record<string, unknown> | null;
    /** Seconds to wait before trying again, from a 429's Retry-After header. */
    retryAfterSec: number | null;
};

const xsrfToken = (): string | null => {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : null;
};

/**
 * One JSON request to Laravel with the session cookie and the CSRF token it handed out. Resolves with the
 * status and body for any answer a page has a state for (including 4xx), and rejects on a network failure,
 * a server error or an expired CSRF token, which the pages show as a retryable error.
 */
export async function sendJson(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    data?: Record<string, unknown>,
    fetchImpl: typeof fetch = fetch,
): Promise<HttpResult> {
    return send(
        method,
        url,
        data ? JSON.stringify(data) : undefined,
        data ? { 'Content-Type': 'application/json' } : {},
        fetchImpl,
    );
}

/**
 * A multipart upload (a recording): the same session cookie and CSRF token, but no Content-Type of our own, so the browser
 * adds the one with the form's boundary.
 */
export async function sendForm(
    url: string,
    form: FormData,
    fetchImpl: typeof fetch = fetch,
): Promise<HttpResult> {
    return send('POST', url, form, {}, fetchImpl);
}

async function send(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body: string | FormData | undefined,
    contentHeaders: Record<string, string>,
    fetchImpl: typeof fetch,
): Promise<HttpResult> {
    const token = xsrfToken();
    const response = await fetchImpl(url, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...contentHeaders,
            ...(token ? { 'X-XSRF-TOKEN': token } : {}),
        },
        body,
    });

    if (response.status >= 500 || response.status === 419) {
        throw new Error(`Request failed (${response.status})`);
    }

    const parsed: unknown = await response.json().catch(() => null);
    const retryAfter = Number(response.headers.get('Retry-After'));

    return {
        status: response.status,
        body:
            parsed && typeof parsed === 'object'
                ? (parsed as Record<string, unknown>)
                : null,
        retryAfterSec: retryAfter > 0 ? retryAfter : null,
    };
}
