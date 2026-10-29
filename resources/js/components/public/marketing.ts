/**
 * Button styles for the public pages (landing and sign-in). They go on the shared `Button` as
 * `className`, so size, focus ring and disabled state stay the same as everywhere else. The staff
 * app keeps the 10px buttons.
 */
export const marketingPrimary =
    'rounded-full bg-linear-to-b from-brand-bright to-brand shadow-cta hover:from-brand hover:to-brand-hover hover:shadow-cta-lift active:shadow-cta motion-reduce:hover:translate-y-0';

export const marketingSecondary =
    'rounded-full border-line-strong bg-white shadow-soft hover:bg-white hover:shadow-float motion-reduce:hover:translate-y-0';

/** The white button on the navy closing band. */
export const marketingOnNavy =
    'rounded-full bg-white text-navy hover:bg-brand-tint hover:shadow-none';
