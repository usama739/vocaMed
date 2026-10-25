export const NAV_SECTIONS = [
    ['tokens', 'Tokens'],
    ['status-badge', 'Status badge'],
    ['voice-capture', 'Voice button'],
    ['app-shell', 'App shell'],
    ['booking-panel', 'Booking panel'],
    ['confirm-dialog', 'Confirm dialog'],
    ['toast', 'Toast'],
    ['states', 'States'],
    ['form-fields', 'Form fields'],
    ['table', 'Table'],
] as const;

export function FoundationNav({
    sections,
}: {
    sections: readonly (readonly [string, string])[];
}) {
    return (
        <nav aria-label="Sections">
            <ul className="flex flex-wrap gap-2">
                {sections.map(([id, label]) => (
                    <li key={id}>
                        <a
                            href={`#${id}`}
                            className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-4 text-control font-semibold text-ink-soft hover:bg-surface-hover"
                        >
                            {label}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
