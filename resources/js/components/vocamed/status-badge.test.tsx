import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { renderIn } from '@/test/render';
import { BADGE_STATUSES, StatusBadge } from './status-badge';

describe('StatusBadge', () => {
    it('covers the seven appointment statuses and four message statuses', () => {
        expect(BADGE_STATUSES).toEqual([
            'booked',
            'confirmed',
            'arrived',
            'in_consultation',
            'done',
            'cancelled',
            'no_show',
            'queued',
            'sent',
            'delivered',
            'failed',
        ]);
    });

    it.each(LOCALES)(
        'shows an icon and a distinct text label for every status in %s',
        (locale) => {
            const labels = new Set<string>();

            for (const status of BADGE_STATUSES) {
                const { container, unmount } = renderIn(
                    locale,
                    <StatusBadge status={status} />,
                );
                const badge = container.querySelector('[data-status]');
                const text = badge?.textContent?.trim() ?? '';

                // Never colour alone: a label that is real text, plus a decorative icon.
                expect(text).not.toBe('');
                expect(text).not.toContain('.'); // not a raw translation key
                expect(
                    badge?.querySelector('svg[aria-hidden="true"]'),
                ).not.toBeNull();

                labels.add(text);
                unmount();
            }

            expect(labels.size).toBe(BADGE_STATUSES.length);
        },
    );

    it('uses the clinic wording from the spec', () => {
        const { container } = renderIn(
            'en',
            <StatusBadge status="in_consultation" />,
        );

        expect(container).toHaveTextContent('In consultation');
    });
});
