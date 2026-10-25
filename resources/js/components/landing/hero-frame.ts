/**
 * The hero booking window is a looping, decorative demo. This pure function says what is on
 * screen at each tick, so the loop can be tested without timers or a browser.
 *
 *   listening  the mic pulses, then the transcript types out
 *   fields     patient, doctor, service, then the flagged time fill in one by one
 *   hold       the 2-minute hold timer starts at 1:48 and counts down
 *   pressed    Confirm presses itself, then everything resets
 */
export const TICK_MS = 120;
export const LOOP_TICKS = 160;
export const HOLD_START_SECONDS = 108;

export type HeroFrame = {
    listening: boolean;
    chars: number;
    /** How many of the four review fields are filled (0 to 4). */
    fields: number;
    holdSeconds: number | null;
    pressed: boolean;
};

const TYPING_START = 14;
const CHARS_PER_TICK = 1.5;

export function heroFrame(tick: number, transcriptLength: number): HeroFrame {
    const t = ((tick % LOOP_TICKS) + LOOP_TICKS) % LOOP_TICKS;
    const typingEnd =
        TYPING_START + Math.ceil(transcriptLength / CHARS_PER_TICK);
    const fieldAt = [6, 14, 22, 30].map((offset) => typingEnd + offset);
    const holdStart = fieldAt[3] + 6;
    const pressAt = holdStart + 26;

    return {
        listening: t < TYPING_START + 4,
        chars: Math.min(
            Math.max(Math.floor((t - TYPING_START) * CHARS_PER_TICK), 0),
            transcriptLength,
        ),
        fields: fieldAt.filter((at) => t >= at).length,
        holdSeconds:
            t >= holdStart
                ? Math.max(
                      0,
                      HOLD_START_SECONDS - Math.floor((t - holdStart) / 8),
                  )
                : null,
        pressed: t >= pressAt && t < pressAt + 6,
    };
}

/** What reduced-motion visitors see: the finished review card, with the timer at its start. */
export function staticFrame(transcriptLength: number): HeroFrame {
    return {
        listening: false,
        chars: transcriptLength,
        fields: 4,
        holdSeconds: HOLD_START_SECONDS,
        pressed: false,
    };
}
