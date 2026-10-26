/**
 * Pure helpers for the template editor: filling a message with sample details, finding variables
 * the server does not know, inserting a variable at the cursor, and counting SMS parts.
 */

const VARIABLE = /\{([^{}]*)\}/g;

/** The message as the patient would see it: every known `{variable}` replaced by its sample value. */
export function renderTemplate(
    body: string,
    sample: Record<string, string>,
): string {
    return body.replace(VARIABLE, (whole, name: string) =>
        name in sample ? sample[name] : whole,
    );
}

/** Variables written in the text that the clinic cannot use, in order and without repeats. */
export function unknownVariables(body: string, known: string[]): string[] {
    const found: string[] = [];

    for (const match of body.matchAll(VARIABLE)) {
        if (!known.includes(match[1]) && !found.includes(match[1])) {
            found.push(match[1]);
        }
    }

    return found;
}

/**
 * Puts `token` where the cursor is, replacing the selection. `start` and `end` are the textarea's
 * selection; without one the token goes at the end. Returns the new text and where the cursor
 * should sit afterwards (just after the token).
 */
export function insertAtCursor(
    text: string,
    token: string,
    selection: { start: number; end: number } | null,
): { text: string; caret: number } {
    const start = Math.min(selection?.start ?? text.length, text.length);
    const end = Math.min(selection?.end ?? text.length, text.length);

    return {
        text: text.slice(0, start) + token + text.slice(end),
        caret: start + token.length,
    };
}

/**
 * SMS length: plain (GSM) text fits 160 characters in one message and 153 per part after that;
 * any other character (Urdu) switches the whole message to 70 and 67.
 */
export function smsLength(text: string): {
    length: number;
    parts: number;
    unicode: boolean;
} {
    const unicode = Array.from(text).some((c) => (c.codePointAt(0) ?? 0) > 127);
    const single = unicode ? 70 : 160;
    const multi = unicode ? 67 : 153;
    const length = text.length;

    return {
        length,
        unicode,
        parts: length <= single ? 1 : Math.ceil(length / multi),
    };
}
