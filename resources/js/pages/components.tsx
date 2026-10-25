import { Head } from '@inertiajs/react';
import { FoundationNav, NAV_SECTIONS } from '@/preview/page-nav';
import {
    StatusBadgeSection,
    TokensSection,
    VoiceSection,
} from '@/preview/foundation-sections';
import { BookingSection, ShellSection } from '@/preview/shell-sections';
import {
    DialogSection,
    FormsSection,
    StatesSection,
    TableSection,
    ToastSection,
} from '@/preview/ui-sections';

/**
 * Component preview: every shared component in every state, in English and Urdu.
 * Development only (the route is registered for local and testing environments).
 */
export default function Components() {
    return (
        <div className="min-h-screen bg-canvas text-copy">
            <Head title="Components" />
            <header className="border-b border-line bg-white">
                <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-6 py-6">
                    <h1 className="text-heading font-bold text-ink">
                        VocaMed components
                    </h1>
                    <p className="max-w-3xl text-control">
                        The shared building blocks, each shown in English (left
                        to right) and Urdu (right to left). All names, numbers
                        and times on this page are sample data. Bracketed text
                        such as [Clinic name] is a placeholder that the server
                        will fill in.
                    </p>
                    <FoundationNav sections={NAV_SECTIONS} />
                </div>
            </header>
            <main className="mx-auto flex max-w-[1400px] flex-col gap-16 px-6 py-10">
                <TokensSection />
                <StatusBadgeSection />
                <VoiceSection />
                <ShellSection />
                <BookingSection />
                <DialogSection />
                <ToastSection />
                <StatesSection />
                <FormsSection />
                <TableSection />
            </main>
        </div>
    );
}
