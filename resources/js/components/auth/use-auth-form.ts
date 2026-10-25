import { useEffect, useRef } from 'react';

/** Error codes map to `auth.errors.*` messages. */
export type ErrorCode =
    'required' | 'email' | 'passwordRule' | 'mismatch' | 'terms' | 'taken';

export type Errors<K extends string> = Partial<Record<K, ErrorCode>>;

/**
 * Moves focus to the first invalid field whenever the set of errors changes, so keyboard and
 * screen-reader users land on what needs fixing. Attach the returned ref to the <form>.
 */
export function useFocusFirstError(errors: object) {
    const form = useRef<HTMLFormElement>(null);
    const count = Object.keys(errors).length;

    useEffect(() => {
        if (count > 0) {
            form.current
                ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus();
        }
    }, [errors, count]);

    return form;
}

export function focusField(form: HTMLFormElement | null, name: string) {
    form?.querySelector<HTMLElement>(`[data-field="${name}"]`)?.focus();
}

export function formatCountdown(seconds: number): string {
    const s = Math.max(0, seconds);

    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
