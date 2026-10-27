import type { ReactNode } from 'react';

/**
 * Patient link pages bring their own phone-first shell (header, language switch, centred column),
 * so this layout adds nothing around them. It exists so `patient/*` pages are not wrapped in the
 * staff or account layouts.
 */
export default function PatientLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
