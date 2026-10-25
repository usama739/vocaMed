/** Mirrors an English message tree with plain strings, so Urdu must define every key. */
export type DeepString<T> = {
    -readonly [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};
