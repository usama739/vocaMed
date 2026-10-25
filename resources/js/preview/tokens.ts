/**
 * The design tokens as documented. `tokens.test.ts` checks every entry against
 * resources/css/app.css, so this list, the CSS and docs/design-tokens.md cannot drift apart.
 */
export type ColorToken = {
    name: string;
    cssVar: string;
    hex: string;
    use: string;
};

export const COLOR_GROUPS: { title: string; tokens: ColorToken[] }[] = [
    {
        title: 'Brand',
        tokens: [
            {
                name: 'brand',
                cssVar: '--color-brand',
                hex: '#1366d6',
                use: 'Primary buttons, links, logo mark, selected borders',
            },
            {
                name: 'brand-hover',
                cssVar: '--color-brand-hover',
                hex: '#0f55b3',
                use: 'Primary button hover, link text',
            },
            {
                name: 'brand-deep',
                cssVar: '--color-brand-deep',
                hex: '#0b4491',
                use: 'Text on brand tint',
            },
            {
                name: 'brand-tint',
                cssVar: '--color-brand-tint',
                hex: '#eaf2fe',
                use: 'Selected chip, pressed toggle, hold banner',
            },
            {
                name: 'brand-wash',
                cssVar: '--color-brand-wash',
                hex: '#ddebfe',
                use: 'Avatar background',
            },
            {
                name: 'brand-line',
                cssVar: '--color-brand-line',
                hex: '#bcd6fa',
                use: 'Border of brand-tint surfaces',
            },
        ],
    },
    {
        title: 'Text',
        tokens: [
            {
                name: 'ink',
                cssVar: '--color-ink',
                hex: '#071437',
                use: 'Headings, input text, labels',
            },
            {
                name: 'ink-soft',
                cssVar: '--color-ink-soft',
                hex: '#2f3a56',
                use: 'Unselected chip text',
            },
            {
                name: 'copy',
                cssVar: '--color-copy',
                hex: '#4b5675',
                use: 'Paragraphs, secondary text',
            },
            {
                name: 'subtle',
                cssVar: '--color-subtle',
                hex: '#5b6781',
                use: 'Captions, placeholders, icons',
            },
            {
                name: 'mute',
                cssVar: '--color-mute',
                hex: '#7a869f',
                use: 'Disabled microphone fill',
            },
        ],
    },
    {
        title: 'Surfaces and lines',
        tokens: [
            {
                name: 'canvas',
                cssVar: '--color-canvas',
                hex: '#f6f7f9',
                use: 'App background, sidebar',
            },
            {
                name: 'surface-subtle',
                cssVar: '--color-surface-subtle',
                hex: '#f9fafb',
                use: 'Filter bars, table headers',
            },
            {
                name: 'surface-hover',
                cssVar: '--color-surface-hover',
                hex: '#f4f6fa',
                use: 'Secondary button hover',
            },
            {
                name: 'surface-row',
                cssVar: '--color-surface-row',
                hex: '#fafbfc',
                use: 'Table row hover',
            },
            {
                name: 'surface-held',
                cssVar: '--color-surface-held',
                hex: '#f1f3f8',
                use: 'Slot held by someone else',
            },
            {
                name: 'line',
                cssVar: '--color-line',
                hex: '#e4e7ee',
                use: 'Card and table borders',
            },
            {
                name: 'line-strong',
                cssVar: '--color-line-strong',
                hex: '#d5d9e3',
                use: 'Control borders',
            },
            {
                name: 'line-soft',
                cssVar: '--color-line-soft',
                hex: '#eef0f5',
                use: 'Dividers inside cards',
            },
            {
                name: 'line-dashed',
                cssVar: '--color-line-dashed',
                hex: '#9aa6bf',
                use: 'Dashed "add new" buttons',
            },
        ],
    },
    {
        title: 'Feedback',
        tokens: [
            {
                name: 'danger',
                cssVar: '--color-danger',
                hex: '#b4153f',
                use: 'Destructive button, recording',
            },
            {
                name: 'danger-ink',
                cssVar: '--color-danger-ink',
                hex: '#9b1239',
                use: 'Destructive text, field errors',
            },
            {
                name: 'danger-deep',
                cssVar: '--color-danger-deep',
                hex: '#7a0e2e',
                use: 'Text on danger surface',
            },
            {
                name: 'danger-surface',
                cssVar: '--color-danger-surface',
                hex: '#fdebef',
                use: 'Error alert background',
            },
            {
                name: 'danger-line',
                cssVar: '--color-danger-line',
                hex: '#f1a3b5',
                use: 'Error alert border',
            },
            {
                name: 'warning-surface',
                cssVar: '--color-warning-surface',
                hex: '#fff6e0',
                use: 'Warning background',
            },
            {
                name: 'warning-line',
                cssVar: '--color-warning-line',
                hex: '#f1c36b',
                use: 'Warning border',
            },
            {
                name: 'warning-ink',
                cssVar: '--color-warning-ink',
                hex: '#6b4300',
                use: 'Warning text',
            },
            {
                name: 'warning-accent',
                cssVar: '--color-warning-accent',
                hex: '#c98a00',
                use: 'Low-confidence field border',
            },
            {
                name: 'success-surface',
                cssVar: '--color-success-surface',
                hex: '#eaf7ee',
                use: 'Success background',
            },
            {
                name: 'success-line',
                cssVar: '--color-success-line',
                hex: '#9cd3ab',
                use: 'Success border',
            },
            {
                name: 'success-ink',
                cssVar: '--color-success-ink',
                hex: '#14532d',
                use: 'Success text',
            },
        ],
    },
    {
        title: 'Status (background)',
        tokens: [
            {
                name: 'status-booked',
                cssVar: '--color-status-booked',
                hex: '#e8ecf4',
                use: 'Booked, Queued',
            },
            {
                name: 'status-confirmed',
                cssVar: '--color-status-confirmed',
                hex: '#ddebfe',
                use: 'Confirmed, Sent',
            },
            {
                name: 'status-arrived',
                cssVar: '--color-status-arrived',
                hex: '#d9f2ea',
                use: 'Arrived',
            },
            {
                name: 'status-consult',
                cssVar: '--color-status-consult',
                hex: '#ebe3fc',
                use: 'In consultation',
            },
            {
                name: 'status-done',
                cssVar: '--color-status-done',
                hex: '#dff3e4',
                use: 'Done, Delivered',
            },
            {
                name: 'status-cancelled',
                cssVar: '--color-status-cancelled',
                hex: '#fbe3ea',
                use: 'Cancelled, Failed',
            },
            {
                name: 'status-noshow',
                cssVar: '--color-status-noshow',
                hex: '#fdebc8',
                use: 'No-show',
            },
        ],
    },
    {
        title: 'Status (text)',
        tokens: [
            {
                name: 'status-booked-ink',
                cssVar: '--color-status-booked-ink',
                hex: '#2f3a56',
                use: 'On status-booked',
            },
            {
                name: 'status-confirmed-ink',
                cssVar: '--color-status-confirmed-ink',
                hex: '#0b4491',
                use: 'On status-confirmed',
            },
            {
                name: 'status-arrived-ink',
                cssVar: '--color-status-arrived-ink',
                hex: '#0a5c4a',
                use: 'On status-arrived',
            },
            {
                name: 'status-consult-ink',
                cssVar: '--color-status-consult-ink',
                hex: '#4c22a0',
                use: 'On status-consult',
            },
            {
                name: 'status-done-ink',
                cssVar: '--color-status-done-ink',
                hex: '#14532d',
                use: 'On status-done',
            },
            {
                name: 'status-cancelled-ink',
                cssVar: '--color-status-cancelled-ink',
                hex: '#9b1239',
                use: 'On status-cancelled',
            },
            {
                name: 'status-noshow-ink',
                cssVar: '--color-status-noshow-ink',
                hex: '#7a4a00',
                use: 'On status-noshow',
            },
        ],
    },
];

export const TYPE_SCALE = [
    {
        cls: 'text-caption',
        cssVar: '--text-caption',
        size: '12px',
        use: 'Keyboard hints, section labels',
    },
    {
        cls: 'text-small',
        cssVar: '--text-small',
        size: '13px',
        use: 'Helper text, status badges, table headers',
    },
    {
        cls: 'text-label',
        cssVar: '--text-label',
        size: '14px',
        use: 'Field labels, secondary text',
    },
    {
        cls: 'text-control',
        cssVar: '--text-control',
        size: '15px',
        use: 'Buttons, nav items, table cells',
    },
    {
        cls: 'text-body',
        cssVar: '--text-body',
        size: '16px',
        use: 'Body text and inputs',
    },
    {
        cls: 'text-lead',
        cssVar: '--text-lead',
        size: '18px',
        use: 'Empty-state titles, countdowns',
    },
    {
        cls: 'text-title',
        cssVar: '--text-title',
        size: '20px',
        use: 'Panel and dialog titles',
    },
    {
        cls: 'text-heading',
        cssVar: '--text-heading',
        size: '26px',
        use: 'Page titles (h1)',
    },
    {
        cls: 'text-hero',
        cssVar: '--text-hero',
        size: '34–56px',
        use: 'Landing hero only',
    },
] as const;

export const RADII = [
    {
        cls: 'rounded-xs',
        cssVar: '--radius-xs',
        px: '6px',
        use: 'Keyboard keys',
    },
    {
        cls: 'rounded-sm',
        cssVar: '--radius-sm',
        px: '8px',
        use: 'Menu items, segmented buttons',
    },
    {
        cls: 'rounded-md',
        cssVar: '--radius-md',
        px: '10px',
        use: 'Every control',
    },
    {
        cls: 'rounded-lg',
        cssVar: '--radius-lg',
        px: '12px',
        use: 'Alerts, toasts',
    },
    {
        cls: 'rounded-xl',
        cssVar: '--radius-xl',
        px: '14px',
        use: 'Tables, inner cards',
    },
    {
        cls: 'rounded-2xl',
        cssVar: '--radius-2xl',
        px: '16px',
        use: 'Page cards, dialogs, panel',
    },
    {
        cls: 'rounded-full',
        cssVar: '',
        px: '999px',
        use: 'Badges, pills, avatars',
    },
] as const;

export const SHADOWS = [
    {
        cls: 'shadow-xs',
        cssVar: '--shadow-xs',
        value: '0 1px 2px rgba(7, 20, 55, 0.06)',
        use: 'Active nav item',
    },
    {
        cls: 'shadow-card',
        cssVar: '--shadow-card',
        value: '0 3px 4px rgba(0, 0, 0, 0.03)',
        use: 'Resting cards',
    },
    {
        cls: 'shadow-lift',
        cssVar: '--shadow-lift',
        value: '0 10px 30px rgba(7, 20, 55, 0.07)',
        use: 'Hovered cards',
    },
    {
        cls: 'shadow-menu',
        cssVar: '--shadow-menu',
        value: '0 12px 28px rgba(7, 20, 55, 0.12)',
        use: 'Dropdowns, toasts',
    },
    {
        cls: 'shadow-panel',
        cssVar: '--shadow-panel',
        value: '0 20px 50px rgba(7, 20, 55, 0.14)',
        use: 'Booking slide-over',
    },
    {
        cls: 'shadow-modal',
        cssVar: '--shadow-modal',
        value: '0 20px 50px rgba(7, 20, 55, 0.25)',
        use: 'Confirm dialog',
    },
] as const;
