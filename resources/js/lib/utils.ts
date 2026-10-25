import type { InertiaLinkProps } from '@inertiajs/react';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The design's own type sizes and shadows (see resources/css/app.css). Without this, tailwind-merge
// reads text-control as a colour and drops it whenever a text colour follows.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [
                {
                    text: [
                        'caption',
                        'small',
                        'label',
                        'control',
                        'body',
                        'lead',
                        'title',
                        'heading',
                        'hero',
                    ],
                },
            ],
            shadow: [{ shadow: ['card', 'lift', 'menu', 'panel', 'modal'] }],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function toUrl(url: NonNullable<InertiaLinkProps['href']>): string {
    return typeof url === 'string' ? url : url.url;
}
