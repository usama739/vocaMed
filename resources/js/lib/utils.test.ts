// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
    it('keeps the design font sizes next to a text colour', () => {
        expect(cn('text-control font-bold', 'text-brand-deep')).toBe(
            'text-control font-bold text-brand-deep',
        );
        expect(cn('text-small', 'text-status-done-ink')).toBe(
            'text-small text-status-done-ink',
        );
    });

    it('still lets a later size replace an earlier size', () => {
        expect(cn('text-control', 'text-lead')).toBe('text-lead');
        expect(cn('text-sm', 'text-title')).toBe('text-title');
    });

    it('keeps the design shadows and lets the last one win', () => {
        expect(cn('shadow-card', 'shadow-menu')).toBe('shadow-menu');
        expect(cn('shadow-menu', 'shadow-black/5')).toBe(
            'shadow-menu shadow-black/5',
        );
    });
});
