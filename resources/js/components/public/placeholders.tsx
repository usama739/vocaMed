import type { ReactNode } from 'react';

/**
 * Text with [BRACKETED PLACEHOLDERS] shown as it should be reviewed: the brackets stay and the
 * span is softly highlighted, so nobody mistakes a gap for finished copy.
 */
export function Placeholders({ children }: { children: string }): ReactNode {
    return children.split(/(\[[^\]]+\])/g).map((part, index) =>
        part.startsWith('[') && part.endsWith(']') ? (
            <mark
                key={index}
                className="rounded-xs bg-warning-surface px-1 text-warning-ink"
            >
                {part}
            </mark>
        ) : (
            part
        ),
    );
}
