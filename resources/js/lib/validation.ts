export const PASSWORD_MIN_LENGTH = 10;

export function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** The rule shown on every password field: 10+ characters with letters and numbers. */
export function meetsPasswordRule(password: string): boolean {
    return (
        password.length >= PASSWORD_MIN_LENGTH &&
        /\p{L}/u.test(password) &&
        /\d/.test(password)
    );
}

/** 0 not set, 1 weak, 2 fair (meets the rule), 3 strong (14+ with a symbol too). */
export type Strength = 0 | 1 | 2 | 3;

export function passwordStrength(password: string): Strength {
    if (password.length === 0) {
        return 0;
    }

    if (!meetsPasswordRule(password)) {
        return 1;
    }

    return password.length >= 14 && /[^\p{L}\d]/u.test(password) ? 3 : 2;
}
